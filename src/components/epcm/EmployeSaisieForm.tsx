import { BadgeEuro, Building2, FileSignature, Gauge, MapPin, ShieldCheck, UserRound } from 'lucide-react'
import { FormulaireEtapes, type EtapeChamps } from '../ui/FormulaireEtapes'
import { formatDate, formatNombre } from '../../lib/format'
import {
  cycleRotation,
  expirationVisiteMedicale,
  finContratEffective,
  horizonPlanning,
  JOURS_CYCLE_ROTATION,
  moisCourant,
  tauxJournalierEffectif,
  tauxJournalierVendu,
} from '../../lib/contratEpcmEngine'
import type { EmployeInput } from '../../lib/contratEpcmFirestore'
import {
  MOIS_VALIDITE_VISITE_MEDICALE,
  STATUT_SIGNATURE_LABELS,
  TYPE_AFFECTATION_EMPLOYE_LABELS,
  TYPE_CONTRAT_EMPLOYE_LABELS,
  type EmployeEpcm,
} from '../../types/contratEpcm'

// Fiche employé du module Contrat EPCM (§2 et §6 de `doc/EPCM.docx`) — moteur
// déclaratif components/ui/FormulaireEtapes, comme les 5 formulaires du module
// Procurement.
//
// Depuis le 26/08/2026 elle porte aussi des **lignes dynamiques**
// (habilitations HSE, périodes de renouvellement) : le moteur a reçu un type
// de champ `lignes` pour ça, plutôt que de faire retomber ce formulaire dans
// du JSX écrit à la main.

const TYPES_CONTRAT = ['CDI', 'CDD', 'AGREMENT']
const STATUTS = ['ACTIF', 'INACTIF']
const TYPES_AFFECTATION_EMPLOYE = ['BUREAU', 'OFFSHORE', 'ONSHORE']
const STATUTS_SIGNATURE = ['SIGNE', 'NON_SIGNE', 'CLAUSES_ACCEPTEES']

// Rémunération selon le cadre d'emploi (rev01, point 6 : « La présentation
// devrait s'adapter automatiquement selon le type de contrat : CDI ; CDD ;
// Agreement/Consultant »). Le document ne dit pas ce qui change ; l'arbitrage
// retenu est celui du §6 lui-même, qui présente les deux rémunérations comme
// un choix : un intervenant sous agrément est payé **au jour presté**, un
// salarié perçoit un **salaire mensuel**.
//
// Tant que le type de contrat n'est pas renseigné, **les deux restent
// affichés** : masquer les deux laisserait une étape « Coûts » sans aucune
// rémunération, et en choisir un serait présumer du cadre d'emploi.
const paieAuJour = (t: EmployeInput['typeContrat']) => t == null || t === 'AGREMENT'
const paieAuMois = (t: EmployeInput['typeContrat']) => t == null || t === 'CDI' || t === 'CDD'

function employeVide(contratReference: string | null): EmployeInput {
  return {
    nom: '',
    prenom: '',
    fonction: null,
    discipline: null,
    service: null,
    typeContrat: null,
    coutJournalier: null,
    coutMensuelVendu: null,
    statut: 'ACTIF',
    site: null,
    responsable: null,
    quotaJoursMois: null,
    quotaHeuresMois: null,
    contratReference,
    typeAffectation: null,
    dateDebutAffectation: null,
    dateFinAffectation: null,
    dateDebutRotation: null,
    dateFinRotation: null,
    binomeId: null,
    dateVisiteMedicale: null,
    habilitations: [],
    dateDebutContrat: null,
    dateFinContrat: null,
    renouvellements: [],
    statutSignature: null,
    salaireBrut: null,
    salaireNet: null,
    deviseSalaire: null,
  }
}

export function EmployeSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  employeInitial,
  suggestions,
  devise,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: EmployeInput) => Promise<void>
  employeInitial: EmployeEpcm | null
  suggestions: {
    fonctions: string[]
    disciplines: string[]
    services: string[]
    sites: string[]
    responsables: string[]
    contrats: string[]
    /** Les autres employés, pour choisir un binôme de rotation. */
    binomes: { id: string; nom: string }[]
  }
  devise: string
}) {
  const etapes: EtapeChamps<
    EmployeInput,
    'identite' | 'emploi' | 'affectation' | 'aptitudes' | 'contrat' | 'couts' | 'quotas'
  >[] = [
    {
      key: 'identite',
      label: 'Identité',
      icon: UserRound,
      optionnel: false,
      aide: "Qui est la personne et ce qu'elle fait — le nom sert de repère dans le planning et les rapports. Fonction, discipline et service se choisissent dans une liste : une valeur qui n'y figure pas s'ajoute dans Paramètres › Listes de valeurs (administrateur).",
      champs: [
        { type: 'texte', cle: 'prenom', label: 'Prénom', requis: true },
        { type: 'texte', cle: 'nom', label: 'Nom', requis: true },
        // Menus déroulants et non plus listes suggérées (rev01, point 1 :
        // « prévoir des menus déroulants pour : les fonctions ; les
        // disciplines ; les services. Cela permettra d'harmoniser les données
        // et d'éviter les erreurs de saisie »). La frappe libre laissait
        // cohabiter deux orthographes d'une même fonction.
        //
        // Les options réunissent les valeurs **déjà présentes sur les fiches**
        // et celles déclarées dans Paramètres › Listes de valeurs. La valeur
        // de la fiche en cours d'édition y figure donc toujours : elle vient
        // du même annuaire que les autres, et fermer la liste ne peut pas
        // l'effacer en silence.
        { type: 'select', cle: 'fonction', label: 'Fonction', options: suggestions.fonctions },
        // Discipline (§2) — distincte du service : le service dit à qui la
        // personne est rattachée, la discipline ce qu'elle sait faire.
        { type: 'select', cle: 'discipline', label: 'Discipline', options: suggestions.disciplines },
        { type: 'select', cle: 'service', label: 'Service', options: suggestions.services },
      ],
      etat: (v) =>
        v.nom && v.prenom
          ? { etat: 'complet', resume: `${v.prenom} ${v.nom}` }
          : { etat: v.nom || v.prenom ? 'partiel' : 'vide', resume: 'Nom et prénom' },
    },
    {
      key: 'emploi',
      label: 'Emploi',
      icon: Building2,
      optionnel: false,
      aide: "Cadre contractuel et rattachement. L'activité n'est plus saisie : elle se déduit des dates du contrat de travail (étape suivante mais une). « Écarter cette personne » sert aux départs anticipés et aux suspensions — un employé ne se supprime pas.",
      champs: [
        { type: 'select', cle: 'typeContrat', label: 'Contrat', options: TYPES_CONTRAT, libelles: TYPE_CONTRAT_EMPLOYE_LABELS },
        // Le statut n'est plus « actif / inactif » mais un **forçage** (rev01,
        // point 2 : « le champ Actif / Non actif ne me semble pas nécessaire
        // en saisie manuelle […] le système devrait être capable de
        // déterminer automatiquement si le contrat est actif ou non »).
        // INACTIF prime sur les dates ; ACTIF laisse la règle décider.
        {
          type: 'select',
          cle: 'statut',
          label: 'Écarter cette personne',
          options: STATUTS,
          libelles: { ACTIF: 'Non — activité déduite du contrat', INACTIF: 'Oui — écartée du contrat EPCM' },
        },
        { type: 'texte', cle: 'responsable', label: 'Responsable hiérarchique', suggestions: suggestions.responsables, pleineLargeur: true },
        // Le champ « Contrat EPCM » a été retiré (rev01, point 2 : « toutes
        // les informations saisies dans cette partie concernent déjà le
        // contrat EPCM », donc le redemander ici ne distingue rien).
        // `contratReference` reste porté par la fiche et **continue d'être
        // enregistré** — il est simplement posé sans être demandé : celui du
        // contrat en cours à la création, celui de la fiche à la
        // modification. Retirer le champ n'efface aucune donnée.
      ],
      etat: (v) =>
        v.typeContrat
          ? { etat: 'complet', resume: `${v.typeContrat}${v.site ? ` · ${v.site}` : ''}` }
          : { etat: v.site || v.responsable ? 'partiel' : 'vide', resume: 'Type de contrat' },
    },
    {
      key: 'affectation',
      label: 'Affectation',
      icon: MapPin,
      optionnel: false,
      aide: "Où la personne est affectée, et son cycle de rotation. La période couverte est celle du contrat de travail — les dates d'affectation ne sont plus demandées, elles la répétaient. Le binôme n'a de sens qu'en rotation : c'est lui qui prendra le relais, en cycle inversé.",
      champs: [
        { type: 'select', cle: 'typeAffectation', label: "Type d'affectation", options: TYPES_AFFECTATION_EMPLOYE, libelles: TYPE_AFFECTATION_EMPLOYE_LABELS },
        { type: 'texte', cle: 'site', label: "Site d'affectation", suggestions: suggestions.sites },
        // Une **seule** paire de dates : la première montée et la première
        // descente (rev01, point 3). L'écart donne la durée du cycle, répétée
        // jusqu'à la fin du contrat — les rotations suivantes sont déduites.
        {
          type: 'date',
          cle: 'dateDebutRotation',
          label: 'Début de rotation (montée sur site)',
          visible: (v) => v.typeAffectation !== 'BUREAU',
        },
        {
          type: 'date',
          cle: 'dateFinRotation',
          label: 'Fin de rotation (descente)',
          visible: (v) => v.typeAffectation !== 'BUREAU',
        },
        {
          type: 'derive',
          label: 'Cycle déduit',
          valeur: (v) => {
            const cycle = cycleRotation(v as unknown as EmployeEpcm)
            return cycle ? `${cycle.joursSurSite} jours sur site / ${cycle.joursRepos} de repos` : null
          },
          aide: `Sans date de descente, le cycle vaut ${JOURS_CYCLE_ROTATION} jours`,
          visible: (v) => v.typeAffectation !== 'BUREAU' && Boolean(v.dateDebutRotation),
        },
        // Le binôme est choisi parmi les autres employés : c'est un lien, pas
        // un nom recopié — sinon renommer quelqu'un romprait le binôme.
        { type: 'select', cle: 'binomeId', label: 'Binôme de rotation', options: suggestions.binomes.map((b) => b.id), libelles: Object.fromEntries(suggestions.binomes.map((b) => [b.id, b.nom])), pleineLargeur: true },
      ],
      etat: (v) => {
        if (!v.typeAffectation) return { etat: v.site ? 'partiel' : 'vide', resume: "Type d'affectation" }
        const libelle = TYPE_AFFECTATION_EMPLOYE_LABELS[v.typeAffectation]
        // Une affectation en rotation sans date de montée ne peut pas générer
        // de planning : l'étape reste partielle plutôt que de paraître prête.
        if (v.typeAffectation !== 'BUREAU' && !v.dateDebutRotation) {
          return { etat: 'partiel', resume: 'Début de rotation' }
        }
        return { etat: 'complet', resume: `${libelle}${v.site ? ` · ${v.site}` : ''}` }
      },
    },
    {
      key: 'aptitudes',
      label: 'Aptitudes',
      icon: ShieldCheck,
      optionnel: true,
      aide: "Visite médicale et habilitations HSE (§2). L'expiration de la visite médicale n'est pas demandée : elle se calcule (12 mois après la visite).",
      champs: [
        { type: 'date', cle: 'dateVisiteMedicale', label: 'Date de la visite médicale' },
        {
          type: 'derive',
          label: 'Expire le',
          valeur: (v) => (v.dateVisiteMedicale ? formatDate(expirationVisiteMedicale(v.dateVisiteMedicale)!) : null),
          aide: `Validité : ${MOIS_VALIDITE_VISITE_MEDICALE} mois`,
        },
        {
          type: 'lignes',
          cle: 'habilitations',
          label: 'Habilitations HSE',
          libelleAjout: 'Ajouter une habilitation',
          messageVide: 'Aucune habilitation renseignée.',
          colonnes: [
            { cle: 'libelle', label: 'Habilitation', type: 'texte', placeholder: 'HUET, Travail en hauteur…' },
            { cle: 'dateObtention', label: 'Obtenue le', type: 'date' },
            { cle: 'dateExpiration', label: 'Expire le', type: 'date' },
          ],
          nouvelle: () => ({ libelle: '', dateObtention: null, dateExpiration: null }),
        },
      ],
      etat: (v) => {
        const n = (v.habilitations ?? []).length
        if (v.dateVisiteMedicale || n > 0) {
          return {
            etat: 'complet',
            resume: [v.dateVisiteMedicale ? 'Visite médicale' : null, n > 0 ? `${n} habilitation(s)` : null].filter(Boolean).join(' · '),
          }
        }
        return { etat: 'vide', resume: 'Rien à signaler' }
      },
    },
    {
      key: 'contrat',
      label: 'Contrat de travail',
      icon: FileSignature,
      optionnel: false,
      aide: "Le contrat de la personne (§6) — à ne pas confondre avec le contrat EPCM signé avec le client, qui vit dans le module Contrats. Ces dates bornent aussi le planning généré et décident de l'activité de la fiche.",
      champs: [
        { type: 'date', cle: 'dateDebutContrat', label: 'Début du contrat' },
        { type: 'date', cle: 'dateFinContrat', label: 'Fin du contrat' },
        { type: 'select', cle: 'statutSignature', label: 'Validation', options: STATUTS_SIGNATURE, libelles: STATUT_SIGNATURE_LABELS },
        {
          type: 'lignes',
          cle: 'renouvellements',
          label: 'Périodes de renouvellement',
          libelleAjout: 'Ajouter une période',
          messageVide: 'Aucun renouvellement.',
          colonnes: [
            { cle: 'debut', label: 'Début', type: 'date' },
            { cle: 'fin', label: 'Fin', type: 'date' },
          ],
          nouvelle: () => ({ debut: null, fin: null }),
        },
        {
          type: 'derive',
          label: 'Période planifiable',
          valeur: (v) => {
            const h = horizonPlanning(v as unknown as EmployeEpcm)
            return h ? `${formatDate(h.debut)} → ${formatDate(h.fin)}` : null
          },
          aide: 'Le planning se génère sur cette période',
        },
        {
          type: 'derive',
          label: 'Échéance effective',
          // Un renouvellement repousse la fin du contrat : afficher la date
          // initiale alors qu'une période plus tardive existe ferait croire à
          // une échéance imminente.
          valeur: (v) => {
            const fin = finContratEffective(v)
            return fin ? formatDate(fin) : null
          },
          aide: 'Fin du contrat, ou du dernier renouvellement',
        },
      ],
      etat: (v) =>
        v.dateDebutContrat
          ? {
              etat: v.statutSignature ? 'complet' : 'partiel',
              resume: v.statutSignature ? STATUT_SIGNATURE_LABELS[v.statutSignature] : 'Signature à renseigner',
            }
          : { etat: v.statutSignature ? 'partiel' : 'vide', resume: 'Dates du contrat' },
    },
    {
      key: 'couts',
      label: 'Coûts',
      icon: BadgeEuro,
      optionnel: false,
      aide: "Ce que la personne coûte, et ce qui est facturé au client pour elle. La rémunération demandée suit le type de contrat : taux journalier pour un freelance sous agrément, salaire mensuel pour un salarié.",
      champs: [
        // Montants dans la devise du contrat EPCM ; la saisie accepte une
        // autre devise et convertit (18/08/2026, référentiel des devises).
        { type: 'montant', cle: 'coutJournalier', label: 'Taux journalier', devise, pas: '0.01', visible: (v) => paieAuJour(v.typeContrat) },
        // Option 2 du §6 : salaire mensuel. Le **salaire net** a été retiré
        // (rev01, point 6 : « Je recommande de supprimer ce champ […]
        // Demander la saisie du salaire net créerait une charge de travail
        // supplémentaire »). Il n'était lu par aucun calcul ; `salaireNet`
        // reste sur la fiche et n'est plus demandé.
        //
        // Le salaire **brut** reste saisi : le rev01 donne certes une formule
        // (« Montant brut = Taux journalier × Nombre de jours travaillés »),
        // mais elle contredit la règle en place — un CDI est payé quel que
        // soit le nombre de jours pointés, ce que `coutReelPaye` traduit.
        // L'arbitrage est ouvert (Q2 du recueil rev01) et n'appartient pas à
        // ce lot.
        { type: 'montant', cle: 'salaireBrut', label: 'Salaire brut mensuel', devise, pas: '0.01', visible: (v) => paieAuMois(v.typeContrat) },
        // Un salarié ne saisit plus de taux journalier : sans ce rappel, son
        // coût pointé (jours × taux) semblerait sorti de nulle part — ou pire,
        // paraîtrait nul. Le diviseur est nommé, il change avec le mois.
        {
          type: 'derive',
          label: 'Soit par jour travaillé',
          valeur: (v) => {
            const taux = tauxJournalierEffectif(v, moisCourant())
            if (taux.origine !== 'SALAIRE_MENSUEL' || taux.valeur == null) return null
            return `${formatNombre(taux.valeur, 0)} ${devise}`
          },
          aide: `Salaire mensuel ÷ ${tauxJournalierEffectif({ coutJournalier: null, salaireBrut: 1 }, moisCourant()).joursDuMois} jours du mois en cours — c'est ce taux qui valorise les journées pointées`,
          visible: (v) => paieAuMois(v.typeContrat) && v.coutJournalier == null && v.salaireBrut != null,
        },
        // « Champ obligatoire » (§6) — et différent du coût salarial : c'est
        // ce qui est budgété dans le contrat avec le client.
        { type: 'montant', cle: 'coutMensuelVendu', label: 'Budget mensuel facturé au client', devise, pas: '0.01', requis: true },
        // « Cette donnée permet notamment de calculer le taux journalier en
        // fonction du nombre de jours du mois considéré » (point 6). C'est le
        // taux **vendu**, à ne pas confondre avec ce que la personne coûte.
        {
          type: 'derive',
          label: 'Vendu par jour',
          valeur: (v) => {
            const vendu = tauxJournalierVendu(v.coutMensuelVendu, moisCourant())
            return vendu == null ? null : `${formatNombre(vendu, 0)} ${devise}`
          },
          aide: 'Budget mensuel facturé ÷ jours du mois en cours',
        },
        {
          type: 'derive',
          label: 'Marge au quota',
          valeur: (v) => {
            const taux = tauxJournalierEffectif(v, moisCourant()).valeur
            return v.coutMensuelVendu != null && taux != null && v.quotaJoursMois != null
              ? `${formatNombre(v.coutMensuelVendu - taux * v.quotaJoursMois, 0)} ${devise}`
              : null
          },
          aide: 'Budget facturé − (coût par jour travaillé × quota de jours)',
        },
      ],
      colonnes: 3,
      etat: (v) => {
        const taux = tauxJournalierEffectif(v, moisCourant())
        if (taux.valeur == null) {
          return { etat: v.coutMensuelVendu != null ? 'partiel' : 'vide', resume: 'Rémunération' }
        }
        return {
          etat: 'complet',
          resume: `${formatNombre(taux.valeur, 0)} ${devise}/j${taux.origine === 'SALAIRE_MENSUEL' ? ' (déduit)' : ''}`,
        }
      },
    },
    {
      key: 'quotas',
      label: 'Quotas',
      icon: Gauge,
      optionnel: true,
      aide: 'Plafond mensuel de jours (§7). Laissé vide, aucun dépassement ne sera signalé pour cette personne.',
      champs: [
        // Le plafond d'**heures** a été retiré (rev01, point 8 : « Nombre
        // d'heures maximum par mois : Pas nécessaire. Le suivi du nombre de
        // jours est suffisant pour notre fonctionnement actuel »), avec sa
        // colonne et son alerte. `quotaHeuresMois` reste sur la fiche sans
        // être demandé ni surveillé.
        { type: 'nombre', cle: 'quotaJoursMois', label: 'Jours max / mois' },
      ],
      colonnes: 1,
      etat: (v) =>
        v.quotaJoursMois != null
          ? { etat: 'complet', resume: `${v.quotaJoursMois} j` }
          : { etat: 'vide', resume: 'Aucun plafond' },
    },
  ]

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={employeInitial ? `Modifier ${employeInitial.prenom} ${employeInitial.nom}` : 'Nouvel employé'}
      libelleSubmit="Enregistrer l'employé"
      cleEdition={employeInitial?.id ?? 'nouveau'}
      valeurInitiale={() => {
        if (!employeInitial) return employeVide(suggestions.contrats[0] ?? null)
        const { id, ...reste } = employeInitial
        void id
        return reste
      }}
      etapes={etapes}
      onSubmit={onSubmit}
    />
  )
}
