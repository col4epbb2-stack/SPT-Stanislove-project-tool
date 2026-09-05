import { Pencil, Trash2 } from 'lucide-react'
import type { ColonneTableau } from '../ui/TableauColonnes'
import type {
  AoProcurement,
  ArticleSurveillance,
  DaProcurement,
  LignePrefa,
  PoProcurement,
} from '../../types/procurementFollowUp'
import { formatDateOuTexte, formatNombre, formatPercent } from '../../lib/format'
import {
  dureeFabricationReelle,
  gapAerien,
  gapExw,
  gapMaritime,
  resteALivrerPrefa,
} from '../../lib/procurementFollowUpEngine'
import { StatutBadge } from './elements'

// Colonnes des 5 journaux du module Procurement (DA, AO, PO, surveillance,
// préfabrication), décrites une seule fois (06/08/2026) — même principe que
// components/tonnage/colonnes.tsx et components/metal/colonnes.tsx : les
// en-têtes et les valeurs étaient deux murs de JSX à tenir dans le même
// ordre (29 colonnes pour le PO, 31 pour la surveillance). Les gaps et
// durées passent par lib/procurementFollowUpEngine.ts.

const texte = (v: string | null | undefined) => v ?? '—'

// Colonne d'édition, identique pour les 5 journaux.
function colonneEditer<T>(onEditer: (ligne: T) => void): ColonneTableau<T> {
  return {
    cle: 'editer',
    entete: '',
    valeur: (l) => (
      <button
        type="button"
        onClick={() => onEditer(l)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5"
        title="Modifier cette ligne"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    ),
  }
}

// Colonne de suppression, identique pour les 5 journaux (04/09/2026, demande
// explicite « on le fera sur toutes les interfaces »). N'apparaît que sur une
// ligne **saisie** (`id` en chaîne, le doc ID Firestore) : une ligne restée
// pure import (`id` numérique de la feuille classeur) n'a aucun document à
// supprimer. Supprimer la saisie d'une ligne qui modifiait un import ne fait
// pas disparaître la ligne — elle réapparaît avec ses valeurs d'origine, seule
// la modification est retirée (même doc ID = même clé, cf. `combinerParCle`) ;
// une ligne créée directement dans l'application, elle, disparaît du tableau.
function colonneSupprimer<T extends { id: number | string }>(onSupprimer: (ligne: T) => void): ColonneTableau<T> {
  return {
    cle: 'supprimer',
    entete: '',
    valeur: (l) =>
      typeof l.id === 'string' ? (
        <button
          type="button"
          onClick={() => onSupprimer(l)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
          title="Supprimer cette saisie"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ) : null,
  }
}

// Un gap positif = retard : mis en évidence, c'est la lecture utile de ces
// colonnes dans le classeur.
const alerteSiRetard =
  <T,>(gap: (l: T) => number | null) =>
  (l: T) =>
    (gap(l) ?? 0) > 0 ? 'text-red-600 font-medium' : ''

export function colonnesDa(
  onEditer: (d: DaProcurement) => void,
  onSupprimer: (d: DaProcurement) => void
): ColonneTableau<DaProcurement>[] {
  return [
    colonneEditer(onEditer),
    {
      cle: 'numero',
      entete: 'Numéro DA',
      valeur: (d) => texte(d.numero),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    { cle: 'ot', entete: 'N° OT', valeur: (d) => texte(d.ot) },
    { cle: 'statut', entete: 'Statut', valeur: (d) => <StatutBadge statut={d.statut} /> },
    colonneSupprimer(onSupprimer),
  ]
}

export function colonnesAo(
  onEditer: (a: AoProcurement) => void,
  onSupprimer: (a: AoProcurement) => void
): ColonneTableau<AoProcurement>[] {
  return [
    colonneEditer(onEditer),
    {
      cle: 'code',
      entete: 'Code / scope',
      valeur: (a) => texte(a.code),
      classeCellule: 'font-medium text-gray-900 max-w-72 truncate',
      titre: (a) => a.code ?? undefined,
    },
    { cle: 'plateforme', entete: 'Plateforme', valeur: (a) => texte(a.plateforme) },
    { cle: 'refAo', entete: 'Réf AO', valeur: (a) => texte(a.refAo) },
    { cle: 'numeroDa', entete: 'N° DA', valeur: (a) => texte(a.numeroDa) },
    {
      cle: 'fournisseur',
      entete: 'Fournisseur',
      valeur: (a) => texte(a.fournisseur),
      classeCellule: 'max-w-56 truncate',
      titre: (a) => a.fournisseur ?? undefined,
    },
    { cle: 'situation', entete: 'Situation', valeur: (a) => texte(a.situation) },
    { cle: 'dateLivraison', entete: 'Date livraison', valeur: (a) => formatDateOuTexte(a.dateLivraison) },
    { cle: 'sado', entete: 'SADO', align: 'right', valeur: (a) => formatNombre(a.sado) },
    { cle: 'dateLancement', entete: 'Lancement', valeur: (a) => formatDateOuTexte(a.dateLancement) },
    { cle: 'dateFinLancement', entete: 'Fin lancement', valeur: (a) => formatDateOuTexte(a.dateFinLancement) },
    {
      cle: 'dateDebutTraitement',
      entete: 'Début traitement',
      valeur: (a) => formatDateOuTexte(a.dateDebutTraitement),
    },
    { cle: 'dateFinTraitement', entete: 'Fin traitement', valeur: (a) => formatDateOuTexte(a.dateFinTraitement) },
    { cle: 'dateAttribution', entete: 'Attribution', valeur: (a) => formatDateOuTexte(a.dateAttribution) },
    { cle: 'statut', entete: 'Statut', valeur: (a) => <StatutBadge statut={a.statut} /> },
    colonneSupprimer(onSupprimer),
  ]
}

export function colonnesPo(
  onEditer: (p: PoProcurement) => void,
  onSupprimer: (p: PoProcurement) => void
): ColonneTableau<PoProcurement>[] {
  return [
    colonneEditer(onEditer),
    {
      cle: 'code',
      entete: 'Code',
      valeur: (p) => texte(p.code),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    {
      cle: 'scope',
      entete: 'Scope',
      valeur: (p) => texte(p.scope),
      classeCellule: 'max-w-56 truncate',
      titre: (p) => p.scope ?? undefined,
    },
    {
      cle: 'descriptif',
      entete: 'Descriptif',
      valeur: (p) => texte(p.descriptif),
      classeCellule: 'max-w-56 truncate',
      titre: (p) => p.descriptif ?? undefined,
    },
    { cle: 'plateforme', entete: 'Plateforme', valeur: (p) => texte(p.plateforme) },
    { cle: 'lead', entete: 'Lead', valeur: (p) => texte(p.lead) },
    { cle: 'responsableAchat', entete: 'Resp. achat', valeur: (p) => texte(p.responsableAchat) },
    {
      cle: 'fournisseur',
      entete: 'Fournisseur',
      valeur: (p) => texte(p.fournisseur),
      classeCellule: 'max-w-48 truncate',
      titre: (p) => p.fournisseur ?? undefined,
    },
    { cle: 'numeroDa', entete: 'N° DA', valeur: (p) => texte(p.numeroDa) },
    { cle: 'numeroPo', entete: 'N° PO', valeur: (p) => texte(p.numeroPo) },
    { cle: 'typeMateriel', entete: 'Type matériel', valeur: (p) => texte(p.typeMateriel) },
    {
      cle: 'designation',
      entete: 'Désignation',
      valeur: (p) => texte(p.designation),
      classeCellule: 'max-w-56 truncate',
      titre: (p) => p.designation ?? undefined,
    },
    { cle: 'transmissionPo', entete: 'Transmission PO', valeur: (p) => formatDateOuTexte(p.dateTransmissionPo) },
    {
      cle: 'delaiFabrication',
      entete: 'Délai fabrication (j)',
      align: 'right',
      valeur: (p) => formatNombre(p.delaiFabricationJours),
    },
    { cle: 'livraisonPrevExw', entete: 'Livraison prév. (EXW)', valeur: (p) => formatDateOuTexte(p.dateLivraisonPrevExw) },
    { cle: 'livraisonReelExw', entete: 'Livraison réelle (EXW)', valeur: (p) => formatDateOuTexte(p.dateLivraisonReelExw) },
    {
      cle: 'delaiFabricationReel',
      entete: 'Délai fabrication réel (j)',
      align: 'right',
      valeur: (p) => formatNombre(dureeFabricationReelle(p)),
    },
    {
      cle: 'gapExw',
      entete: 'Gap EXW (j)',
      align: 'right',
      valeur: (p) => formatNombre(gapExw(p)),
      classeLigne: alerteSiRetard(gapExw),
    },
    { cle: 'etaPrevMaritime', entete: 'ETA prév. maritime', valeur: (p) => formatDateOuTexte(p.etaPrevMaritime) },
    { cle: 'etaReelMaritime', entete: 'ETA réel maritime', valeur: (p) => formatDateOuTexte(p.etaReelMaritime) },
    {
      cle: 'gapMaritime',
      entete: 'Gap maritime (j)',
      align: 'right',
      valeur: (p) => formatNombre(gapMaritime(p)),
      classeLigne: alerteSiRetard(gapMaritime),
    },
    { cle: 'etaPrevAerien', entete: 'ETA prév. aérien', valeur: (p) => formatDateOuTexte(p.etaPrevAerien) },
    { cle: 'etaReelAerien', entete: 'ETA réel aérien', valeur: (p) => formatDateOuTexte(p.etaReelAerien) },
    {
      cle: 'gapAerien',
      entete: 'Gap aérien (j)',
      align: 'right',
      valeur: (p) => formatNombre(gapAerien(p)),
      classeLigne: alerteSiRetard(gapAerien),
    },
    { cle: 'statut', entete: 'Statut', valeur: (p) => <StatutBadge statut={p.statut} /> },
    { cle: 'chrono', entete: 'Chrono', valeur: (p) => texte(p.chrono) },
    {
      cle: 'departement',
      entete: 'Département',
      valeur: (p) => texte(p.departement),
      classeCellule: 'max-w-44 truncate',
      titre: (p) => p.departement ?? undefined,
    },
    { cle: 'sanction', entete: 'Sanction', valeur: (p) => texte(p.sanction) },
    {
      cle: 'commentairesDuet',
      entete: 'Commentaires DUET',
      valeur: (p) => texte(p.commentairesDuet),
      classeCellule: 'max-w-48 truncate',
      titre: (p) => p.commentairesDuet ?? undefined,
    },
    {
      cle: 'commentairesTransit',
      entete: 'Commentaires transit',
      valeur: (p) => texte(p.commentairesTransit),
      classeCellule: 'max-w-48 truncate',
      titre: (p) => p.commentairesTransit ?? undefined,
    },
    colonneSupprimer(onSupprimer),
  ]
}

export function colonnesSurveillance(
  onEditer: (a: ArticleSurveillance) => void,
  onSupprimer: (a: ArticleSurveillance) => void
): ColonneTableau<ArticleSurveillance>[] {
  return [
    colonneEditer(onEditer),
    {
      cle: 'scope',
      entete: 'Scope',
      valeur: (a) => texte(a.scope),
      classeCellule: 'max-w-52 truncate',
      titre: (a) => a.scope ?? undefined,
    },
    {
      cle: 'numeroPo',
      entete: 'N° PO',
      valeur: (a) => texte(a.numeroPo),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    { cle: 'statut', entete: 'Statut', valeur: (a) => <StatutBadge statut={a.statut} /> },
    { cle: 'numero', entete: 'N°', valeur: (a) => texte(a.numero) },
    {
      cle: 'designation',
      entete: 'Désignation',
      valeur: (a) => texte(a.designation),
      classeCellule: 'max-w-64 truncate',
      titre: (a) => a.designation ?? undefined,
    },
    { cle: 'niveauRisque', entete: 'Niveau de risque', valeur: (a) => texte(a.niveauRisque) },
    { cle: 'levelInspection', entete: 'Level inspection', valeur: (a) => texte(a.levelInspection) },
    {
      cle: 'typeInspection',
      entete: "Type d'inspection",
      valeur: (a) => texte(a.typeInspection),
      classeCellule: 'max-w-48 truncate',
      titre: (a) => a.typeInspection ?? undefined,
    },
    { cle: 'dateFat', entete: 'FAT', valeur: (a) => formatDateOuTexte(a.dateFat) },
    { cle: 'livraisonPrevExw', entete: 'Livraison prév. (EXW)', valeur: (a) => formatDateOuTexte(a.dateLivraisonPrevExw) },
    { cle: 'madTransit', entete: 'MAD transit', valeur: (a) => formatDateOuTexte(a.dateMadTransit) },
    { cle: 'instructionMad', entete: 'Instruction / MAD', valeur: (a) => formatDateOuTexte(a.dateInstructionMad) },
    { cle: 'avisMad', entete: 'Avis MAD', valeur: (a) => texte(a.avisMad) },
    {
      cle: 'madLieu',
      entete: 'Lieu MAD',
      valeur: (a) => texte(a.madLieu),
      classeCellule: 'max-w-40 truncate',
      titre: (a) => a.madLieu ?? undefined,
    },
    { cle: 'certificatProgec', entete: 'Certif. PROGEC', valeur: (a) => texte(a.certificatProgec) },
    { cle: 'certificatOrigine', entete: 'Certif. origine', valeur: (a) => texte(a.certificatOrigine) },
    { cle: 'colisage', entete: 'Colisage', valeur: (a) => texte(a.colisage) },
    { cle: 'signatureFacture', entete: 'Facture signée', valeur: (a) => texte(a.signatureFacture) },
    { cle: 'madDefinitive', entete: 'MAD définitive', valeur: (a) => formatDateOuTexte(a.madDefinitive) },
    { cle: 'pickUp', entete: 'Pick-up', valeur: (a) => formatDateOuTexte(a.pickUp) },
    { cle: 'expedition', entete: 'Expédition', valeur: (a) => formatDateOuTexte(a.expedition) },
    { cle: 'typeTransit', entete: 'Transit', valeur: (a) => texte(a.typeTransit) },
    { cle: 'etd', entete: 'ETD', valeur: (a) => formatDateOuTexte(a.etd) },
    { cle: 'etaPogPrev', entete: 'ETA POG prév.', valeur: (a) => formatDateOuTexte(a.etaPogPrev) },
    { cle: 'etaLbv', entete: 'ETA LBV', valeur: (a) => formatDateOuTexte(a.etaLbv) },
    { cle: 'etaPog', entete: 'ETA POG', valeur: (a) => formatDateOuTexte(a.etaPog) },
    {
      cle: 'livraisonMagasin',
      entete: 'Livraison magasin',
      valeur: (a) => formatDateOuTexte(a.dateLivraisonMagasin),
    },
    { cle: 'avancement', entete: 'Avancement', align: 'right', valeur: (a) => formatPercent(a.avancement) },
    { cle: 'pds', entete: 'PDS', align: 'right', valeur: (a) => formatPercent(a.pds) },
    { cle: 'gap', entete: 'Gap', align: 'right', valeur: (a) => formatPercent(a.gap) },
    {
      cle: 'commentaires',
      entete: 'Commentaires',
      valeur: (a) => texte(a.commentaires),
      classeCellule: 'max-w-48 truncate',
      titre: (a) => a.commentaires ?? undefined,
    },
    colonneSupprimer(onSupprimer),
  ]
}

export function colonnesPrefa(
  onEditer: (l: LignePrefa) => void,
  onSupprimer: (l: LignePrefa) => void
): ColonneTableau<LignePrefa>[] {
  return [
    colonneEditer(onEditer),
    {
      cle: 'code',
      entete: 'Code',
      valeur: (l) => texte(l.code),
      classeCellule: 'font-medium text-gray-900 max-w-64 truncate',
      titre: (l) => l.code ?? undefined,
    },
    { cle: 'plateforme', entete: 'Plateforme', valeur: (l) => texte(l.plateforme) },
    { cle: 'responsable', entete: 'Responsable', valeur: (l) => texte(l.responsable) },
    { cle: 'numeroPo', entete: 'N° PO / DA', valeur: (l) => texte(l.numeroPo) },
    {
      cle: 'designation',
      entete: 'Désignation',
      valeur: (l) => texte(l.designation),
      classeCellule: 'max-w-60 truncate',
      titre: (l) => l.designation ?? undefined,
    },
    { cle: 'etaLbv', entete: 'ETA LBV', valeur: (l) => formatDateOuTexte(l.etaLbv) },
    { cle: 'etaPog', entete: 'ETA POG', valeur: (l) => formatDateOuTexte(l.etaPog) },
    { cle: 'livraisonMagasin', entete: 'Livraison magasin', valeur: (l) => texte(l.livraisonMagasin) },
    { cle: 'livraisonCtr', entete: 'Livraison CTR', valeur: (l) => formatDateOuTexte(l.dateLivraisonCtr) },
    { cle: 'madRevisee', entete: 'MAD révisée', valeur: (l) => formatDateOuTexte(l.dateMadRevisee) },
    { cle: 'qte', entete: 'Qté', align: 'right', valeur: (l) => formatNombre(l.qte) },
    { cle: 'avancement', entete: 'Avancement', align: 'right', valeur: (l) => formatPercent(l.avancement) },
    { cle: 'besoinCtr', entete: 'Besoin CTR', align: 'right', valeur: (l) => formatNombre(l.besoinCtr) },
    { cle: 'qteLivreeCtr', entete: 'Qté livrée CTR', align: 'right', valeur: (l) => formatNombre(l.qteLivreeCtr) },
    {
      cle: 'resteALivrer',
      entete: 'Reste à livrer',
      align: 'right',
      valeur: (l) => formatNombre(resteALivrerPrefa(l)),
      classeLigne: (l) => ((resteALivrerPrefa(l) ?? 0) > 0 ? 'text-red-600 font-medium' : ''),
    },
    {
      cle: 'commentaires',
      entete: 'Commentaires',
      valeur: (l) => texte(l.commentaires),
      classeCellule: 'max-w-48 truncate',
      titre: (l) => l.commentaires ?? undefined,
    },
    colonneSupprimer(onSupprimer),
  ]
}
