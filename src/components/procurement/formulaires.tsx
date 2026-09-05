import { Boxes, ClipboardList, FileCheck2, FileText, Package, Plane, Ship, Tag, Truck } from 'lucide-react'
import type {
  AoProcurement,
  ArticleSurveillance,
  DaProcurement,
  LignePrefa,
  PoProcurement,
} from '../../types/procurementFollowUp'
import {
  dureeFabricationReelle,
  gapAerien,
  gapExw,
  gapMaritime,
  resteALivrerPrefa,
} from '../../lib/procurementFollowUpEngine'
import { formatNombre } from '../../lib/format'
import { FormulaireEtapes, type EtapeChamps } from '../ui/FormulaireEtapes'

// Les 5 formulaires de saisie du module Procurement (06/08/2026) — un par
// journal du classeur, décrits en objets plutôt qu'écrits en JSX (moteur :
// components/ui/FormulaireEtapes.tsx). Ils ne demandent que les colonnes
// saisies ; les colonnes calculées (délai de fabrication réel, gaps EXW /
// maritime / aérien, reste à livrer) sont affichées en dérivé au fil de la
// saisie, dans l'étape où elles prennent leur sens.
//
// Ces journaux venaient jusqu'ici de blobs figés du classeur, en lecture
// seule : c'est le premier point de saisie du module.

const OUI_NON = ['OUI', 'NON']
const STATUTS = ['IN PROGRESS', 'CLOSED']

const texte = (v: string | null) => v ?? '—'

// --- Journal DA ------------------------------------------------------------

export type DaSaisieInput = Omit<DaProcurement, 'id'>

export function DaSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  ligneInitiale,
  suggestions,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: DaSaisieInput) => Promise<void>
  ligneInitiale: DaProcurement | null
  suggestions: { ots: string[] }
}) {
  const etapes: EtapeChamps<DaSaisieInput, 'da'>[] = [
    {
      key: 'da',
      label: "Demande d'achat",
      icon: ClipboardList,
      optionnel: false,
      aide: "Le numéro de DA relie la demande à son appel d'offres puis à sa commande dans les journaux AO et PO.",
      colonnes: 3,
      champs: [
        {
          type: 'ficheProjet',
          cle: 'projetId',
          pleineLargeur: true,
          label: 'Fiche projet rattachée',
        },
        { type: 'texte', cle: 'numero', label: 'Numéro DA', requis: true },
        { type: 'texte', cle: 'ot', label: 'N° OT', suggestions: suggestions.ots },
        { type: 'select', cle: 'statut', label: 'Statut', options: STATUTS },
      ],
      etat: (v) =>
        v.numero
          ? { etat: 'complet', resume: `${v.numero} · ${texte(v.statut)}` }
          : { etat: 'vide', resume: 'Numéro de DA' },
    },
  ]

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={ligneInitiale ? `Modifier la DA ${ligneInitiale.numero ?? ''}` : "Nouvelle demande d'achat"}
      libelleSubmit="Enregistrer la DA"
      cleEdition={String(ligneInitiale?.id ?? 'nouveau')}
      valeurInitiale={() =>
        ligneInitiale
          ? { numero: ligneInitiale.numero, ot: ligneInitiale.ot, statut: ligneInitiale.statut }
          : { numero: null, ot: null, statut: 'IN PROGRESS' }
      }
      etapes={etapes}
      onSubmit={onSubmit}
    />
  )
}

// --- Journal AO ------------------------------------------------------------

export type AoSaisieInput = Omit<AoProcurement, 'id'>

function aoVide(): AoSaisieInput {
  return {
    code: null,
    scope: null,
    plateforme: null,
    refAo: null,
    numeroDa: null,
    fournisseur: null,
    situation: null,
    dateLivraison: null,
    sado: null,
    dateLancement: null,
    dateFinLancement: null,
    dateDebutTraitement: null,
    dateFinTraitement: null,
    dateAttribution: null,
    statut: null,
  }
}

export function AoSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  ligneInitiale,
  suggestions,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: AoSaisieInput) => Promise<void>
  ligneInitiale: AoProcurement | null
  suggestions: { plateformes: string[]; fournisseurs: string[]; situations: string[]; numerosDa: string[] }
}) {
  const etapes: EtapeChamps<AoSaisieInput, 'identification' | 'consultation' | 'attribution'>[] = [
    {
      key: 'identification',
      label: 'Identification',
      icon: Tag,
      optionnel: false,
      aide: "La référence AO et le n° de DA relient l'appel d'offres à la demande dont il est issu.",
      champs: [
        {
          type: 'ficheProjet',
          cle: 'projetId',
          pleineLargeur: true,
          label: 'Fiche projet rattachée',
        },
        { type: 'texte', cle: 'refAo', label: 'Réf AO', requis: true },
        { type: 'texte', cle: 'numeroDa', label: 'N° DA', suggestions: suggestions.numerosDa },
        { type: 'texte', cle: 'code', label: 'Code / scope', pleineLargeur: true },
        { type: 'texte', cle: 'scope', label: 'Scope', pleineLargeur: true },
        { type: 'texte', cle: 'plateforme', label: 'Plateforme', suggestions: suggestions.plateformes },
      ],
      etat: (v) =>
        v.refAo
          ? { etat: 'complet', resume: `${v.refAo} · ${texte(v.plateforme)}` }
          : { etat: 'vide', resume: 'Réf AO manquante' },
    },
    {
      key: 'consultation',
      label: 'Consultation',
      icon: FileText,
      optionnel: false,
      aide: "Jalons du cycle de consultation : lancement, traitement des offres, puis attribution. Ce sont ces dates qui alimentent les histogrammes de durée du dashboard.",
      colonnes: 3,
      champs: [
        { type: 'date', cle: 'dateLancement', label: 'Lancement' },
        { type: 'date', cle: 'dateFinLancement', label: 'Fin lancement' },
        { type: 'date', cle: 'dateDebutTraitement', label: 'Début traitement' },
        { type: 'date', cle: 'dateFinTraitement', label: 'Fin traitement' },
        { type: 'date', cle: 'dateAttribution', label: 'Attribution' },
      ],
      etat: (v) => {
        const n = [
          v.dateLancement,
          v.dateFinLancement,
          v.dateDebutTraitement,
          v.dateFinTraitement,
          v.dateAttribution,
        ].filter(Boolean).length
        if (v.dateLancement) return { etat: 'complet', resume: `${n}/5 jalons` }
        return n > 0 ? { etat: 'partiel', resume: 'Lancement manquant' } : { etat: 'vide', resume: 'Jalons du cycle' }
      },
    },
    {
      key: 'attribution',
      label: 'Attribution',
      icon: FileCheck2,
      optionnel: true,
      aide: "Fournisseur retenu et engagement de livraison — renseignés une fois l'AO attribué.",
      champs: [
        { type: 'texte', cle: 'fournisseur', label: 'Fournisseur', suggestions: suggestions.fournisseurs },
        { type: 'texte', cle: 'situation', label: 'Situation', suggestions: suggestions.situations },
        { type: 'date', cle: 'dateLivraison', label: 'Date de livraison' },
        { type: 'nombre', cle: 'sado', label: 'SADO' },
        { type: 'select', cle: 'statut', label: 'Statut', options: STATUTS },
      ],
      etat: (v) =>
        v.fournisseur
          ? { etat: 'complet', resume: `${v.fournisseur}` }
          : { etat: 'vide', resume: 'Pas encore attribué' },
    },
  ]

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={ligneInitiale ? `Modifier l'AO ${ligneInitiale.refAo ?? ''}` : "Nouvel appel d'offres"}
      libelleSubmit="Enregistrer l'AO"
      cleEdition={String(ligneInitiale?.id ?? 'nouveau')}
      valeurInitiale={() => {
        if (!ligneInitiale) return aoVide()
        const { id, ...reste } = ligneInitiale
        void id
        return reste
      }}
      etapes={etapes}
      onSubmit={onSubmit}
    />
  )
}

// --- Journal PO ------------------------------------------------------------

export type PoSaisieInput = Omit<PoProcurement, 'id'>

function poVide(): PoSaisieInput {
  return {
    code: null,
    scope: null,
    descriptif: null,
    plateforme: null,
    lead: null,
    responsableAchat: null,
    fournisseur: null,
    numeroDa: null,
    numeroPo: null,
    typeMateriel: null,
    designation: null,
    dateTransmissionPo: null,
    delaiFabricationJours: null,
    dateLivraisonPrevExw: null,
    dateLivraisonReelExw: null,
    etaPrevMaritime: null,
    etaReelMaritime: null,
    etaPrevAerien: null,
    etaReelAerien: null,
    statut: null,
    commentairesDuet: null,
    commentairesTransit: null,
    po: null,
    codePo: null,
    chrono: null,
    departement: null,
    dptmAbreviation: null,
    sanction: null,
    typeMateriel2: null,
  }
}

// Un input de saisie n'est pas une ligne complète (il lui manque l'id) : les
// fonctions du moteur prennent une ligne, on leur en fabrique une pour
// l'aperçu des colonnes calculées.
const apercuPo = (v: PoSaisieInput): PoProcurement => ({ id: 0, ...v })

export function PoSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  ligneInitiale,
  suggestions,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: PoSaisieInput) => Promise<void>
  ligneInitiale: PoProcurement | null
  suggestions: {
    plateformes: string[]
    fournisseurs: string[]
    leads: string[]
    responsables: string[]
    typesMateriel: string[]
    numerosDa: string[]
    departements: string[]
  }
}) {
  const etapes: EtapeChamps<PoSaisieInput, 'commande' | 'fabrication' | 'transport' | 'classement' | 'notes'>[] = [
    {
      key: 'commande',
      label: 'Commande',
      icon: Package,
      optionnel: false,
      aide: 'Le n° de PO est la clé de suivi de la commande : il relie le journal PO, la surveillance qualité et le transit.',
      champs: [
        {
          type: 'ficheProjet',
          cle: 'projetId',
          pleineLargeur: true,
          label: 'Fiche projet rattachée',
        },
        { type: 'texte', cle: 'numeroPo', label: 'N° PO', requis: true },
        { type: 'texte', cle: 'numeroDa', label: 'N° DA', suggestions: suggestions.numerosDa },
        { type: 'texte', cle: 'code', label: 'Code' },
        { type: 'texte', cle: 'plateforme', label: 'Plateforme', suggestions: suggestions.plateformes },
        { type: 'texte', cle: 'scope', label: 'Scope', pleineLargeur: true },
        { type: 'texte', cle: 'descriptif', label: 'Descriptif', pleineLargeur: true },
        { type: 'texte', cle: 'designation', label: 'Désignation', pleineLargeur: true },
        { type: 'texte', cle: 'fournisseur', label: 'Fournisseur', suggestions: suggestions.fournisseurs },
        { type: 'texte', cle: 'typeMateriel', label: 'Type de matériel', suggestions: suggestions.typesMateriel },
        { type: 'texte', cle: 'lead', label: 'Lead', suggestions: suggestions.leads },
        { type: 'texte', cle: 'responsableAchat', label: "Responsable d'achat", suggestions: suggestions.responsables },
      ],
      etat: (v) =>
        v.numeroPo
          ? { etat: 'complet', resume: `${v.numeroPo} · ${texte(v.fournisseur)}` }
          : { etat: 'vide', resume: 'N° PO manquant' },
    },
    {
      key: 'fabrication',
      label: 'Fabrication',
      icon: Boxes,
      optionnel: false,
      aide: "De la transmission du PO à la livraison sortie d'usine (EXW). Le délai réel et le gap se calculent seuls.",
      colonnes: 2,
      champs: [
        { type: 'date', cle: 'dateTransmissionPo', label: 'Transmission du PO' },
        { type: 'nombre', cle: 'delaiFabricationJours', label: 'Délai de fabrication annoncé (j)' },
        { type: 'date', cle: 'dateLivraisonPrevExw', label: 'Livraison prévisionnelle (EXW)' },
        { type: 'date', cle: 'dateLivraisonReelExw', label: 'Livraison réelle (EXW)' },
        {
          type: 'derive',
          label: 'Délai de fabrication réel (j)',
          valeur: (v) => formatNombre(dureeFabricationReelle(apercuPo(v))),
          aide: 'Livraison réelle − transmission du PO',
        },
        {
          type: 'derive',
          label: 'Gap EXW (j)',
          valeur: (v) => formatNombre(gapExw(apercuPo(v))),
          aide: 'Réelle − prévisionnelle (positif = retard)',
        },
      ],
      etat: (v) =>
        v.dateTransmissionPo
          ? {
              etat: 'complet',
              resume: v.dateLivraisonReelExw
                ? `Gap EXW ${formatNombre(gapExw(apercuPo(v)))} j`
                : 'En fabrication',
            }
          : { etat: 'vide', resume: 'PO non transmis' },
    },
    {
      key: 'transport',
      label: 'Transport',
      icon: Ship,
      optionnel: true,
      aide: 'ETA prévisionnels et réels par voie. Les gaps sont calculés, comme dans le classeur.',
      champs: [
        { type: 'date', cle: 'etaPrevMaritime', label: 'ETA prévisionnel maritime' },
        { type: 'date', cle: 'etaReelMaritime', label: 'ETA réel maritime' },
        {
          type: 'derive',
          label: 'Gap maritime (j)',
          valeur: (v) => formatNombre(gapMaritime(apercuPo(v))),
        },
        { type: 'date', cle: 'etaPrevAerien', label: 'ETA prévisionnel aérien' },
        { type: 'date', cle: 'etaReelAerien', label: 'ETA réel aérien' },
        {
          type: 'derive',
          label: 'Gap aérien (j)',
          valeur: (v) => formatNombre(gapAerien(apercuPo(v))),
        },
      ],
      etat: (v) => {
        const n = [v.etaPrevMaritime, v.etaReelMaritime, v.etaPrevAerien, v.etaReelAerien].filter(Boolean).length
        return n > 0
          ? { etat: 'complet', resume: `${n}/4 ETA` }
          : { etat: 'vide', resume: 'Pas encore expédié' }
      },
    },
    {
      key: 'classement',
      label: 'Classement',
      icon: Truck,
      optionnel: true,
      aide: 'Références internes de suivi de la commande.',
      colonnes: 2,
      champs: [
        { type: 'select', cle: 'statut', label: 'Statut', options: STATUTS },
        { type: 'texte', cle: 'chrono', label: 'Chrono' },
        { type: 'texte', cle: 'departement', label: 'Département', suggestions: suggestions.departements },
        { type: 'texte', cle: 'sanction', label: 'Sanction' },
      ],
      etat: (v) => (v.statut ? { etat: 'complet', resume: v.statut } : { etat: 'vide', resume: 'À vérifier' }),
    },
    {
      key: 'notes',
      label: 'Commentaires',
      icon: FileText,
      optionnel: true,
      colonnes: 1,
      champs: [
        { type: 'texte', cle: 'commentairesDuet', label: 'Commentaires DUET' },
        { type: 'texte', cle: 'commentairesTransit', label: 'Commentaires transit' },
      ],
      etat: (v) =>
        v.commentairesDuet || v.commentairesTransit
          ? { etat: 'complet', resume: 'Commentaire saisi' }
          : { etat: 'vide', resume: 'RAS' },
    },
  ]

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={ligneInitiale ? `Modifier le PO ${ligneInitiale.numeroPo ?? ''}` : 'Nouvelle commande (PO)'}
      libelleSubmit="Enregistrer le PO"
      cleEdition={String(ligneInitiale?.id ?? 'nouveau')}
      valeurInitiale={() => {
        if (!ligneInitiale) return poVide()
        const { id, ...reste } = ligneInitiale
        void id
        return reste
      }}
      etapes={etapes}
      onSubmit={onSubmit}
    />
  )
}

// --- Surveillance ----------------------------------------------------------

export type SurveillanceSaisieInput = Omit<ArticleSurveillance, 'id'>

function articleVide(): SurveillanceSaisieInput {
  return {
    scope: null,
    numeroPo: null,
    statut: null,
    numero: null,
    designation: null,
    niveauRisque: null,
    levelInspection: null,
    typeInspection: null,
    dateFat: null,
    dateLivraisonPrevExw: null,
    dateMadTransit: null,
    dateInstructionMad: null,
    avisMad: null,
    madLieu: null,
    certificatProgec: null,
    certificatOrigine: null,
    colisage: null,
    signatureFacture: null,
    madDefinitive: null,
    pickUp: null,
    expedition: null,
    typeTransit: null,
    etd: null,
    etaPogPrev: null,
    etaLbv: null,
    etaPog: null,
    dateLivraisonMagasin: null,
    commentaires: null,
    avancement: null,
    pds: null,
    gap: null,
  }
}

export function SurveillanceSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  ligneInitiale,
  suggestions,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: SurveillanceSaisieInput) => Promise<void>
  ligneInitiale: ArticleSurveillance | null
  suggestions: {
    scopes: string[]
    numerosPo: string[]
    niveauxRisque: string[]
    levelsInspection: string[]
    typesInspection: string[]
    lieuxMad: string[]
    typesTransit: string[]
  }
}) {
  const etapes: EtapeChamps<
    SurveillanceSaisieInput,
    'article' | 'inspection' | 'mad' | 'transport' | 'avancement'
  >[] = [
    {
      key: 'article',
      label: 'Article',
      icon: Package,
      optionnel: false,
      aide: "L'article est identifié par sa commande (n° PO) et son numéro de ligne dans cette commande.",
      champs: [
        {
          type: 'ficheProjet',
          cle: 'projetId',
          pleineLargeur: true,
          label: 'Fiche projet rattachée',
        },
        { type: 'texte', cle: 'numeroPo', label: 'N° PO', requis: true, suggestions: suggestions.numerosPo },
        { type: 'texte', cle: 'numero', label: 'N° de ligne' },
        { type: 'texte', cle: 'scope', label: 'Scope', suggestions: suggestions.scopes, pleineLargeur: true },
        { type: 'texte', cle: 'designation', label: 'Désignation', pleineLargeur: true },
        { type: 'select', cle: 'statut', label: 'Statut', options: STATUTS },
      ],
      etat: (v) =>
        v.numeroPo
          ? { etat: 'complet', resume: `${v.numeroPo}${v.numero ? ` · ${v.numero}` : ''}` }
          : { etat: 'vide', resume: 'N° PO manquant' },
    },
    {
      key: 'inspection',
      label: 'Inspection',
      icon: FileCheck2,
      optionnel: false,
      aide: "Le niveau de risque détermine le niveau et le type d'inspection avant expédition (FAT).",
      champs: [
        { type: 'texte', cle: 'niveauRisque', label: 'Niveau de risque', suggestions: suggestions.niveauxRisque },
        {
          type: 'texte',
          cle: 'levelInspection',
          label: 'Level inspection',
          suggestions: suggestions.levelsInspection,
        },
        { type: 'texte', cle: 'typeInspection', label: "Type d'inspection", suggestions: suggestions.typesInspection },
        { type: 'date', cle: 'dateFat', label: 'Date FAT' },
        { type: 'date', cle: 'dateLivraisonPrevExw', label: 'Livraison prévisionnelle (EXW)' },
      ],
      etat: (v) =>
        v.niveauRisque
          ? { etat: 'complet', resume: v.niveauRisque }
          : { etat: 'vide', resume: 'Niveau de risque' },
    },
    {
      key: 'mad',
      label: 'MAD & documents',
      icon: FileText,
      optionnel: true,
      aide: "Mise à disposition : l'avis de MAD déclenche l'enlèvement, les documents conditionnent le dédouanement.",
      colonnes: 3,
      champs: [
        { type: 'date', cle: 'dateMadTransit', label: 'MAD transit' },
        { type: 'date', cle: 'dateInstructionMad', label: 'Instruction / MAD' },
        { type: 'select', cle: 'avisMad', label: 'Avis MAD', options: OUI_NON },
        { type: 'texte', cle: 'madLieu', label: 'Lieu de MAD', suggestions: suggestions.lieuxMad },
        { type: 'select', cle: 'certificatProgec', label: 'Certificat PROGEC', options: OUI_NON },
        { type: 'select', cle: 'certificatOrigine', label: "Certificat d'origine", options: OUI_NON },
        { type: 'select', cle: 'colisage', label: 'Colisage', options: OUI_NON },
        { type: 'select', cle: 'signatureFacture', label: 'Facture signée', options: OUI_NON },
        { type: 'texte', cle: 'madDefinitive', label: 'MAD définitive' },
      ],
      etat: (v) =>
        v.avisMad ? { etat: 'complet', resume: `Avis MAD ${v.avisMad}` } : { etat: 'vide', resume: 'MAD non émise' },
    },
    {
      key: 'transport',
      label: 'Transport',
      icon: Plane,
      optionnel: true,
      aide: 'Enlèvement, expédition et arrivées : ETD, ETA LBV puis POG, jusqu’à la livraison magasin.',
      colonnes: 3,
      champs: [
        { type: 'date', cle: 'pickUp', label: 'Pick-up' },
        { type: 'select', cle: 'expedition', label: 'Expédition', options: OUI_NON },
        { type: 'texte', cle: 'typeTransit', label: 'Type de transit', suggestions: suggestions.typesTransit },
        { type: 'date', cle: 'etd', label: 'ETD' },
        { type: 'date', cle: 'etaPogPrev', label: 'ETA POG prévisionnel' },
        { type: 'date', cle: 'etaLbv', label: 'ETA LBV' },
        { type: 'date', cle: 'etaPog', label: 'ETA POG' },
        { type: 'date', cle: 'dateLivraisonMagasin', label: 'Livraison magasin' },
      ],
      etat: (v) => {
        if (v.dateLivraisonMagasin) return { etat: 'complet', resume: 'Livré magasin' }
        const n = [v.pickUp, v.etd, v.etaLbv, v.etaPog].filter(Boolean).length
        return n > 0 ? { etat: 'complet', resume: `${n}/4 jalons` } : { etat: 'vide', resume: 'Pas encore expédié' }
      },
    },
    {
      key: 'avancement',
      label: 'Avancement',
      icon: FileCheck2,
      optionnel: true,
      // Le "gap" du classeur n'est PAS l'écart avancement − PDS : vérifié sur
      // les 1 612 articles réels, les deux ne concordent sur aucune ligne
      // (typiquement avancement = PDS = 100 % avec un gap de −100 %). Il
      // reste donc une saisie, sans formule inventée pour combler l'écart.
      aide: "Avancement de fabrication, PDS et gap tels que suivis dans le classeur — le gap n'y est pas l'écart entre les deux, il reste saisi.",
      colonnes: 3,
      champs: [
        { type: 'pourcentage', cle: 'avancement', label: 'Avancement' },
        { type: 'pourcentage', cle: 'pds', label: 'PDS' },
        { type: 'pourcentage', cle: 'gap', label: 'Gap' },
        { type: 'texte', cle: 'commentaires', label: 'Commentaires', pleineLargeur: true },
      ],
      etat: (v) =>
        v.avancement != null
          ? { etat: 'complet', resume: `${Math.round(v.avancement * 100)} %` }
          : { etat: 'vide', resume: 'À renseigner' },
    },
  ]

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={ligneInitiale ? `Modifier l'article ${ligneInitiale.numeroPo ?? ''}` : 'Nouvel article sous surveillance'}
      libelleSubmit="Enregistrer l'article"
      cleEdition={String(ligneInitiale?.id ?? 'nouveau')}
      valeurInitiale={() => {
        if (!ligneInitiale) return articleVide()
        const { id, ...reste } = ligneInitiale
        void id
        return reste
      }}
      etapes={etapes}
      onSubmit={onSubmit}
    />
  )
}

// --- Suivi préfabrication --------------------------------------------------

export type PrefaSaisieInput = Omit<LignePrefa, 'id'>

function prefaVide(): PrefaSaisieInput {
  return {
    code: null,
    plateforme: null,
    responsable: null,
    numeroPo: null,
    designation: null,
    etaLbv: null,
    etaPog: null,
    livraisonMagasin: null,
    dateLivraisonCtr: null,
    dateMadRevisee: null,
    commentaires: null,
    qte: null,
    avancement: null,
    besoinCtr: null,
    qteLivreeCtr: null,
    resteALivrer: null,
  }
}

export function PrefaSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  ligneInitiale,
  suggestions,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: PrefaSaisieInput) => Promise<void>
  ligneInitiale: LignePrefa | null
  suggestions: { plateformes: string[]; responsables: string[]; numerosPo: string[] }
}) {
  const etapes: EtapeChamps<PrefaSaisieInput, 'ligne' | 'livraison' | 'quantites' | 'notes'>[] = [
    {
      key: 'ligne',
      label: 'Matériel',
      icon: Package,
      optionnel: false,
      champs: [
        {
          type: 'ficheProjet',
          cle: 'projetId',
          pleineLargeur: true,
          label: 'Fiche projet rattachée',
        },
        { type: 'texte', cle: 'numeroPo', label: 'N° PO / DA', requis: true, suggestions: suggestions.numerosPo },
        { type: 'texte', cle: 'plateforme', label: 'Plateforme', suggestions: suggestions.plateformes },
        { type: 'texte', cle: 'code', label: 'Code', pleineLargeur: true },
        { type: 'texte', cle: 'designation', label: 'Désignation', pleineLargeur: true },
        { type: 'texte', cle: 'responsable', label: 'Responsable', suggestions: suggestions.responsables },
      ],
      etat: (v) =>
        v.numeroPo
          ? { etat: 'complet', resume: `${v.numeroPo} · ${texte(v.plateforme)}` }
          : { etat: 'vide', resume: 'N° PO manquant' },
    },
    {
      key: 'livraison',
      label: 'Livraison',
      icon: Truck,
      optionnel: false,
      aide: "Arrivées LBV puis POG, livraison magasin, puis mise à disposition du contractant.",
      colonnes: 3,
      champs: [
        { type: 'date', cle: 'etaLbv', label: 'ETA LBV' },
        { type: 'date', cle: 'etaPog', label: 'ETA POG' },
        { type: 'select', cle: 'livraisonMagasin', label: 'Livraison magasin', options: OUI_NON },
        { type: 'date', cle: 'dateLivraisonCtr', label: 'Livraison CTR' },
        { type: 'date', cle: 'dateMadRevisee', label: 'MAD révisée' },
      ],
      etat: (v) =>
        v.livraisonMagasin
          ? { etat: 'complet', resume: `Magasin : ${v.livraisonMagasin}` }
          : { etat: 'vide', resume: 'Livraison magasin ?' },
    },
    {
      key: 'quantites',
      label: 'Quantités',
      icon: Boxes,
      optionnel: false,
      aide: 'Le reste à livrer au contractant est calculé, comme dans le classeur.',
      colonnes: 2,
      champs: [
        { type: 'nombre', cle: 'qte', label: 'Quantité commandée' },
        { type: 'pourcentage', cle: 'avancement', label: 'Avancement' },
        { type: 'nombre', cle: 'besoinCtr', label: 'Besoin CTR' },
        { type: 'nombre', cle: 'qteLivreeCtr', label: 'Qté livrée CTR' },
        {
          type: 'derive',
          label: 'Reste à livrer',
          valeur: (v) => formatNombre(resteALivrerPrefa(v)),
          aide: 'Besoin CTR − quantité livrée',
        },
      ],
      etat: (v) =>
        v.qte != null
          ? { etat: 'complet', resume: `${formatNombre(v.qte)} · reste ${formatNombre(resteALivrerPrefa(v))}` }
          : { etat: 'vide', resume: 'Quantité manquante' },
    },
    {
      key: 'notes',
      label: 'Commentaires',
      icon: FileText,
      optionnel: true,
      colonnes: 1,
      champs: [{ type: 'texte', cle: 'commentaires', label: 'Commentaires' }],
      etat: (v) =>
        v.commentaires ? { etat: 'complet', resume: 'Commentaire saisi' } : { etat: 'vide', resume: 'RAS' },
    },
  ]

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={ligneInitiale ? `Modifier la ligne ${ligneInitiale.numeroPo ?? ''}` : 'Nouvelle ligne de préfabrication'}
      libelleSubmit="Enregistrer la ligne"
      cleEdition={String(ligneInitiale?.id ?? 'nouveau')}
      valeurInitiale={() => {
        if (!ligneInitiale) return prefaVide()
        const { id, ...reste } = ligneInitiale
        void id
        return reste
      }}
      // `resteALivrer` est recalculé à l'enregistrement plutôt que saisi : la
      // colonne existe dans le type (lignes importées), elle ne doit pas
      // rester figée sur une valeur périmée après modification des quantités.
      onSubmit={(v) => onSubmit({ ...v, resteALivrer: resteALivrerPrefa(v) })}
      etapes={etapes}
    />
  )
}
