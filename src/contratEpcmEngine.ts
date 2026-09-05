import { HEURES_PAR_JOUR_POINTE, MOIS_VALIDITE_VISITE_MEDICALE } from '../types/contratEpcm'
import { hpif, ltif, trir } from '../types/hse'
import type {
  AlerteEpcm,
  ContratEpcmDoc,
  EmployeEpcm,
  HabilitationHse,
  NiveauAlerte,
  PlanningMoisEpcm,
  PointageJourEpcm,
  PointageMoisEpcm,
  RenouvellementContrat,
  RoleEpcm,
  RotationEpcm,
  SaisieHseEpcm,
  TypeAffectation,
} from '../types/contratEpcm'

// Moteur de calcul du module Contrat EPCM (08/08/2026) : tout ce qui est
// dérivable l'est ici, en fonctions pures (elles prennent des données déjà
// chargées, ne lisent jamais Firestore) — comme hebdoCrjEngine ou
// contratPeintureEngine.
//
// Aucune constante métier inventée : pas de coût journalier par défaut, pas
// de quota implicite, pas de budget de démonstration. Un employé sans coût
// journalier pèse 0 dans les coûts et le dit (l'onglet Personnel le signale)
// plutôt que d'être valorisé au hasard.

// --- Affectations ----------------------------------------------------------

export interface InfoAffectation {
  label: string
  /** Lettre affichée dans la case du calendrier mensuel. */
  court: string
  /**
   * Journée payée au coût journalier (§2 : « combien il est payé par jour
   * travaillé »). Congés, repos et absences ne comptent pas de jour
   * travaillé ; formation et mission si, l'employé étant mobilisé.
   * Table unique : changer la règle, c'est changer cette colonne.
   */
  travaille: boolean
  /** Compté dans « personnel présent sur site » du tableau de bord. */
  surSite: boolean
  classe: string
  classeDouce: string
}

export const AFFECTATIONS: Record<TypeAffectation, InfoAffectation> = {
  SITE: { label: 'Présent sur site', court: 'S', travaille: true, surSite: true, classe: 'bg-primary text-white', classeDouce: 'bg-primary/10 text-primary' },
  BUREAU: { label: 'Présent au bureau', court: 'B', travaille: true, surSite: false, classe: 'bg-blue-500 text-white', classeDouce: 'bg-blue-50 text-blue-700' },
  // **Comptée sur site** depuis le rev01 (point Planning : « dès qu'elles sont
  // sur l'installation, elles doivent être considérées comme présentes sur
  // site »). Le rev00 les séparait (§10, « les additionner compterait deux
  // fois la même personne ») : la distinction n'est pas perdue pour autant —
  // `EtatJourEpcm` garde un compteur `rotation` propre, et le tableau de bord
  // affiche « dont n en rotation » sous l'effectif sur site.
  ROTATION: { label: 'Rotation', court: 'R', travaille: true, surSite: true, classe: 'bg-accent text-white', classeDouce: 'bg-accent/10 text-accent' },
  MISSION: { label: 'Mission', court: 'M', travaille: true, surSite: false, classe: 'bg-amber-500 text-white', classeDouce: 'bg-amber-50 text-amber-700' },
  FORMATION: { label: 'Formation', court: 'F', travaille: true, surSite: false, classe: 'bg-teal-500 text-white', classeDouce: 'bg-teal-50 text-teal-700' },
  CONGE: { label: 'Congé', court: 'C', travaille: false, surSite: false, classe: 'bg-green-500 text-white', classeDouce: 'bg-green-50 text-green-700' },
  REPOS: { label: 'Repos', court: 'O', travaille: false, surSite: false, classe: 'bg-gray-400 text-white', classeDouce: 'bg-gray-100 text-gray-600' },
  ABSENCE_JUSTIFIEE: { label: 'Absence justifiée', court: 'AJ', travaille: false, surSite: false, classe: 'bg-orange-500 text-white', classeDouce: 'bg-orange-50 text-orange-700' },
  ABSENCE_NON_JUSTIFIEE: { label: 'Absence non justifiée', court: 'AN', travaille: false, surSite: false, classe: 'bg-red-500 text-white', classeDouce: 'bg-red-50 text-red-700' },
}

export const TYPES_AFFECTATION = Object.keys(AFFECTATIONS) as TypeAffectation[]

/**
 * Ce que la palette du planning propose de poser (rev01, point Planning :
 * « Il faut réduire le nombre d'informations affichées et ne conserver que les
 * éléments suivants » — Rotation, S, B, C, puis « Repos : cette information
 * n'est pas nécessaire » et « Absence (J ou NJ) : OK »).
 *
 * **`AFFECTATIONS` garde les neuf**, et c'est délibéré : `REPOS`, `MISSION` et
 * `FORMATION` ne sont plus *posables*, mais des journées déjà planifiées les
 * portent — les retirer de la table les rendrait illisibles, jusqu'à faire
 * disparaître des jours du calendrier. Elles restent affichées, comptées et
 * exportées comme avant.
 *
 * Mission et Formation ne sont nommées **nulle part** dans le document, ni
 * pour être gardées ni pour être retirées : c'est la lecture littérale de
 * « ne conserver que », confirmée avec l'utilisateur le 27/08/2026.
 */
export const TYPES_AFFECTATION_SAISIE: TypeAffectation[] = [
  'SITE',
  'BUREAU',
  'ROTATION',
  'CONGE',
  'ABSENCE_JUSTIFIEE',
  'ABSENCE_NON_JUSTIFIEE',
]

export const ROLES_EPCM: Record<RoleEpcm, string> = {
  ADMINISTRATEUR: 'Administrateur',
  RESPONSABLE_CONTRAT: 'Responsable contrat',
  CHEF_PROJET: 'Chef de projet',
  RH: 'RH',
  RESPONSABLE_SITE: 'Responsable de site',
  CONSULTATION: 'Consultation uniquement',
}

/** Profils autorisés à écrire dans le module (§13). */
const ROLES_ECRITURE: RoleEpcm[] = ['ADMINISTRATEUR', 'RESPONSABLE_CONTRAT', 'CHEF_PROJET', 'RH', 'RESPONSABLE_SITE']

export function peutModifier(role: RoleEpcm): boolean {
  return ROLES_ECRITURE.includes(role)
}

/** Seul un administrateur EPCM gère le contrat, le budget et les profils. */
export function peutAdministrer(role: RoleEpcm): boolean {
  return role === 'ADMINISTRATEUR'
}

// --- Dates -----------------------------------------------------------------

const JOUR_MS = 86_400_000

export function moisDe(date: string): string {
  return date.slice(0, 7)
}

export function moisCourant(): string {
  return new Date().toISOString().slice(0, 7)
}

export function libelleMois(mois: string): string {
  const [annee, m] = mois.split('-')
  const noms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return `${noms[Number(m) - 1] ?? m} ${annee}`
}

/** Les jours d'un mois, en ISO. Calculs en UTC : pas de décalage de fuseau. */
export function joursDuMois(mois: string): string[] {
  const [annee, m] = mois.split('-').map(Number)
  const nb = new Date(Date.UTC(annee, m, 0)).getUTCDate()
  return Array.from({ length: nb }, (_, i) => `${mois}-${String(i + 1).padStart(2, '0')}`)
}

export function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = []
  for (let t = Date.parse(`${debut}T00:00:00Z`); t <= Date.parse(`${fin}T00:00:00Z`); t += JOUR_MS) {
    jours.push(new Date(t).toISOString().slice(0, 10))
  }
  return jours
}

/** 0 = dimanche. Sert à griser les week-ends du calendrier. */
export function jourSemaine(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function estWeekEnd(date: string): boolean {
  const j = jourSemaine(date)
  return j === 0 || j === 6
}

export function decalerMois(mois: string, pas: number): string {
  const [annee, m] = mois.split('-').map(Number)
  const d = new Date(Date.UTC(annee, m - 1 + pas, 1))
  return d.toISOString().slice(0, 7)
}

// --- Synthèse par employé --------------------------------------------------

// --- Aptitudes et contrat de travail (§2, §6 de doc/EPCM.docx) -------------

/**
 * Date d'expiration d'une visite médicale : **12 mois après la visite**
 * (§2, « elle expire après 12 mois »).
 *
 * Calculée et jamais stockée : la saisir en double permettrait aux deux
 * valeurs de diverger. `null` si aucune visite n'est renseignée — une
 * absence de visite n'est pas une visite expirée, c'est une information
 * manquante, et les deux appellent des actions différentes.
 */
export function expirationVisiteMedicale(dateVisite: string | null): string | null {
  if (!dateVisite) return null
  const d = new Date(dateVisite)
  if (Number.isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + MOIS_VALIDITE_VISITE_MEDICALE)
  return d.toISOString().slice(0, 10)
}

/**
 * Fin **effective** du contrat de travail : la date de fin, ou celle du
 * dernier renouvellement si elle est postérieure (§6, « possibilité d'ajouter
 * plusieurs périodes de renouvellement »).
 *
 * Un renouvellement repousse l'échéance : afficher la date initiale alors
 * qu'une période plus tardive existe ferait croire à une échéance imminente,
 * et l'alerte « contrat expirant » se déclencherait pour rien.
 */
/**
 * Cette personne compte-t-elle dans l'effectif à cette date ?
 *
 * Règle du rev01, point 2 : l'activité se **déduit du contrat**. Deux
 * garde-fous, tous deux délibérés :
 *
 * - **`INACTIF` prime sur les dates** — c'est le forçage manuel conservé
 *   (départ anticipé, suspension), et le seul usage qui reste du champ
 *   `statut`. Sans lui, écarter quelqu'un obligerait à avancer sa date de fin
 *   de contrat, c'est-à-dire à réécrire une donnée contractuelle pour un motif
 *   qui ne l'est pas ;
 * - **seule la fin compte, pas le début.** Une fiche dont le contrat n'a pas
 *   encore commencé reste dans l'effectif : c'est précisément la période où
 *   l'on planifie sa mobilisation. L'exclure ferait disparaître du planning
 *   les arrivées à préparer. L'écran signale le cas au lieu de la sortir.
 *
 * Une fiche **sans dates de contrat** est active : une absence de date n'est
 * pas une fin de contrat.
 */
export function estActif(employe: EmployeEpcm, date: string): boolean {
  if (employe.statut === 'INACTIF') return false
  const fin = finContratEffective(employe)
  return fin == null || fin >= date
}

/** Le contrat de cette personne n'a-t-il pas encore commencé à cette date ? */
export function contratNonCommence(employe: EmployeEpcm, date: string): boolean {
  return Boolean(employe.dateDebutContrat && employe.dateDebutContrat > date)
}

export function finContratEffective(employe: {
  dateFinContrat?: string | null
  renouvellements?: RenouvellementContrat[]
}): string | null {
  const dates = [employe.dateFinContrat, ...(employe.renouvellements ?? []).map((r) => r.fin)].filter(
    (d): d is string => Boolean(d)
  )
  if (dates.length === 0) return null
  return dates.reduce((max, d) => (d > max ? d : max))
}

/**
 * Habilitations expirées à une date donnée. Une habilitation **sans date
 * d'expiration n'est jamais expirée** : le document ne donne aucune durée de
 * validité commune (contrairement à la visite médicale), et en inventer une
 * ferait expirer des habilitations valides.
 */
export function habilitationsExpirees(
  habilitations: HabilitationHse[] | undefined,
  aujourdHui: string
): HabilitationHse[] {
  return (habilitations ?? []).filter((h) => h.dateExpiration != null && h.dateExpiration < aujourdHui)
}

// --- Génération du planning prévisionnel (§3 de doc/EPCM.docx) -------------

/**
 * Cycle de rotation : « 28 jours travaillés, 28 jours de repos » (§3).
 * Nommé plutôt qu'écrit en dur : c'est la seule valeur à changer si le cycle
 * du contrat change.
 */
export const JOURS_CYCLE_ROTATION = 28

export interface PropositionPlanning {
  employeId: string
  libelle: string
  /** Jours proposés — ceux **qui ne sont pas déjà planifiés**, sauf reprogrammation. */
  aPoser: Record<string, TypeAffectation>
  /** Nombre de jours déjà planifiés, laissés tels quels. */
  conserves: number
  /** Jours déjà planifiés qui seront **remplacés** (reprogrammation seulement). */
  remplaces: number
  /** Pourquoi rien ne peut être proposé, le cas échéant. */
  impossible?: string
}

/**
 * Cycle de rotation d'une personne, déduit de **la seule paire de dates**
 * qu'elle porte (rev01, point 3).
 *
 * L'écart entre la montée et la descente donne la durée sur site ; la période
 * de repos est de **même durée** — c'est le « 28/28 » du document, exprimé par
 * les dates plutôt que codé en dur. Sans date de descente, on retombe sur
 * `JOURS_CYCLE_ROTATION`, la seule valeur que le document nomme.
 */
export interface CycleRotation {
  debut: string
  joursSurSite: number
  joursRepos: number
}

export function cycleRotation(employe: EmployeEpcm): CycleRotation | null {
  if (!employe.dateDebutRotation) return null
  const joursSurSite = employe.dateFinRotation
    ? joursEntre(employe.dateDebutRotation, employe.dateFinRotation).length
    : JOURS_CYCLE_ROTATION
  if (joursSurSite <= 0) return null
  return { debut: employe.dateDebutRotation, joursSurSite, joursRepos: joursSurSite }
}

/**
 * Période sur laquelle un planning se génère : celle du **contrat de travail**
 * (rev01, point 3 — « nous renseignons déjà la date de début du contrat ; la
 * date de fin du contrat »), renouvellements compris.
 */
export function horizonPlanning(employe: EmployeEpcm): { debut: string; fin: string } | null {
  const fin = finContratEffective(employe)
  if (!employe.dateDebutContrat || !fin || fin < employe.dateDebutContrat) return null
  return { debut: employe.dateDebutContrat, fin }
}

/**
 * Les prochaines rotations d'une personne (rev01, point 3 : « les dates de
 * montée sur site ; les dates de descente du personnel ; les prochaines
 * rotations programmées »).
 *
 * **Déduites du cycle, jamais saisies** : une liste tenue à la main
 * divergerait du planning dès la première rotation décalée.
 */
export interface RotationProgrammee {
  employeId: string
  libelle: string
  debut: string
  fin: string
}

export function prochainesRotations(
  employe: EmployeEpcm,
  depuis: string,
  jusqua: string,
  maximum = 6
): RotationProgrammee[] {
  const cycle = cycleRotation(employe)
  const horizon = horizonPlanning(employe)
  if (!cycle || !horizon || employe.typeAffectation === 'BUREAU') return []

  const rotations: RotationProgrammee[] = []
  const pas = cycle.joursSurSite + cycle.joursRepos
  const borne = jusqua < horizon.fin ? jusqua : horizon.fin
  for (let n = 0; rotations.length < maximum; n++) {
    const debut = decalerJours(cycle.debut, n * pas)
    if (debut > borne) break
    const fin = decalerJours(debut, cycle.joursSurSite - 1)
    // Une rotation déjà terminée n'est pas « à venir ».
    if (fin >= depuis && debut <= borne) {
      rotations.push({ employeId: employe.id, libelle: nomComplet(employe), debut, fin })
    }
    if (n > 400) break
  }
  return rotations
}

function decalerJours(date: string, jours: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + jours * JOUR_MS).toISOString().slice(0, 10)
}

/**
 * Planning prévisionnel d'une personne, déduit de son affectation (§3 :
 * « le planning prévisionnel doit être généré automatiquement dès qu'une
 * affectation est créée »).
 *
 * **Deux régimes, ceux du document :**
 * - *en rotation* (offshore / onshore) — cycle 28 jours sur site / 28 jours
 *   de repos, **week-ends compris** : « les week-ends sont travaillés et
 *   doivent être intégrés automatiquement dans le calcul » ;
 * - *bureau* — jours ouvrés seulement : « les samedis et dimanches ne sont
 *   pas planifiés automatiquement. Si un week-end doit être travaillé, il
 *   sera ajouté manuellement. » Ces jours sont donc **laissés vides**, et non
 *   posés en repos : un samedi non planifié se distingue ainsi d'un samedi
 *   déclaré chômé.
 *
 * **Un jour déjà planifié n'est jamais écrasé.** C'est le garde-fou qui rend
 * la génération rejouable : sans lui, regénérer effacerait les exceptions
 * saisies à la main — c'est-à-dire tout le travail de l'utilisateur.
 *
 * `decale` inverse le cycle : c'est ce que reçoit le binôme (§3, « Stan
 * 28 jours ON, Armel 28 jours OFF, puis inversion du cycle »).
 *
 * Fonction **pure** : elle ne lit ni n'écrit rien, elle propose.
 */
export function genererPlanning(
  employe: EmployeEpcm,
  plannings: PlanningMoisEpcm[],
  decale = false,
  /**
   * **Reprogrammation** (rev01, point 3 : « en cas d'imprévu […] il devrait
   * être possible de modifier les dates du planning ; de reprogrammer les
   * rotations concernées »). C'est le seul cas où la génération **écrase** des
   * jours déjà planifiés — d'où un drapeau explicite, et un décompte
   * `remplaces` que l'écran doit montrer avant d'écrire.
   */
  remplacer = false
): PropositionPlanning {
  const base: PropositionPlanning = {
    employeId: employe.id,
    libelle: nomComplet(employe),
    aPoser: {},
    conserves: 0,
    remplaces: 0,
  }

  if (!employe.typeAffectation) return { ...base, impossible: "Aucun type d'affectation n'est renseigné." }

  // L'horizon est celui du **contrat** (rev01, point 3) : les dates
  // d'affectation ne sont plus saisies.
  const horizon = horizonPlanning(employe)
  if (!horizon) {
    return { ...base, impossible: 'Les dates de début et de fin du contrat de travail sont nécessaires.' }
  }

  const cycle = employe.typeAffectation === 'BUREAU' ? null : cycleRotation(employe)
  if (employe.typeAffectation !== 'BUREAU' && !cycle) {
    return { ...base, impossible: 'La date de début de rotation est nécessaire pour une affectation en rotation.' }
  }

  // Jours déjà planifiés, tous mois confondus.
  const dejaPlanifies = new Set(
    plannings.filter((p) => p.employeId === employe.id).flatMap((p) => Object.keys(p.jours))
  )

  const aPoser: Record<string, TypeAffectation> = {}
  let conserves = 0
  let remplaces = 0

  for (const date of joursEntre(horizon.debut, horizon.fin)) {
    const affectation = affectationDuJourDuCycle(employe.typeAffectation, cycle, date, decale)
    if (affectation === null) continue
    if (dejaPlanifies.has(date)) {
      if (!remplacer) {
        conserves += 1
        continue
      }
      remplaces += 1
    }
    aPoser[date] = affectation
  }

  return { ...base, aPoser, conserves, remplaces }
}

/**
 * Ce que le régime d'affectation pose un jour donné — `null` = jour laissé
 * hors planning (un week-end de bureau).
 */
/**
 * Ce que le régime pose un jour donné — `null` = jour laissé hors planning
 * (week-end de bureau, ou jour OFF d'un cycle).
 *
 * Le cycle est **ancré sur la date de montée saisie** et non sur le début du
 * contrat : c'est elle qui dit quand la personne monte, et le contrat ne
 * commence pas forcément un jour de rotation.
 */
function affectationDuJourDuCycle(
  type: NonNullable<EmployeEpcm['typeAffectation']>,
  cycle: CycleRotation | null,
  date: string,
  decale: boolean
): TypeAffectation | null {
  if (type === 'BUREAU' || !cycle) return estWeekEnd(date) ? null : 'BUREAU'

  const pas = cycle.joursSurSite + cycle.joursRepos
  // Rang du jour dans le cycle, y compris avant la première montée (modulo
  // qui reste positif) : un contrat qui commence avant la rotation saisie est
  // planifié à rebours du même cycle.
  const ecart = joursDepuis(cycle.debut, date)
  const rang = ((ecart % pas) + pas) % pas
  const surSite = decale ? rang >= cycle.joursSurSite : rang < cycle.joursSurSite
  // Jours OFF : **rien n'est posé** (rev01, point Planning — « Repos : cette
  // information n'est pas nécessaire »). Ils sont laissés hors planning
  // plutôt que déclarés en congé : les compter en congé consommerait des
  // congés que personne n'a posés. Un jour vide se distingue ainsi d'un jour
  // déclaré, comme les week-ends d'une affectation bureau.
  return surSite ? 'SITE' : null
}

function joursDepuis(origine: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${origine}T00:00:00Z`)) / JOUR_MS)
}

/**
 * Ce que le régime d'affectation d'une personne **attend** un jour donné —
 * `null` quand rien n'est attendu (jour OFF d'un cycle, week-end de bureau,
 * date hors période d'affectation, ou régime inconnu).
 *
 * Sert à ne pas signaler comme « planning incomplet » les jours qu'aucun
 * régime ne devait remplir : depuis que les jours OFF ne sont plus posés,
 * chaque cycle de repos en aurait déclenché une alerte.
 */
export function affectationAttendue(employe: EmployeEpcm, date: string): TypeAffectation | null {
  if (!regimeConnu(employe)) return null
  const horizon = horizonPlanning(employe)!
  if (date < horizon.debut || date > horizon.fin) return null
  const cycle = employe.typeAffectation === 'BUREAU' ? null : cycleRotation(employe)
  return affectationDuJourDuCycle(employe.typeAffectation!, cycle, date, false)
}

/** Le régime de cette personne permet-il de savoir ce qui est attendu ? */
export function regimeConnu(employe: EmployeEpcm): boolean {
  if (!employe.typeAffectation || !horizonPlanning(employe)) return false
  return employe.typeAffectation === 'BUREAU' || cycleRotation(employe) !== null
}

/**
 * Les propositions à faire quand on génère le planning d'une affectation :
 * celle de la personne, et **celle de son binôme en cycle inversé** s'il en a
 * un (§3 et §5).
 *
 * Le binôme n'est proposé que si son affectation est renseignée : générer sur
 * une fiche vide poserait des jours sur une période qui n'est pas la sienne.
 */
export function propositionsAffectation(
  employe: EmployeEpcm,
  employes: EmployeEpcm[],
  plannings: PlanningMoisEpcm[],
  remplacer = false
): PropositionPlanning[] {
  const propositions = [genererPlanning(employe, plannings, false, remplacer)]
  const binome = employe.binomeId ? employes.find((e) => e.id === employe.binomeId) : undefined
  // Le binôme reçoit le cycle inversé, mais **ancré sur la rotation de
  // l'employé** : c'est ce qui fait qu'il descend quand l'autre monte.
  if (binome && regimeConnu({ ...binome, dateDebutRotation: binome.dateDebutRotation ?? employe.dateDebutRotation })) {
    propositions.push(
      genererPlanning(
        { ...binome, dateDebutRotation: binome.dateDebutRotation ?? employe.dateDebutRotation, dateFinRotation: binome.dateFinRotation ?? employe.dateFinRotation },
        plannings,
        true,
        remplacer
      )
    )
  }
  return propositions
}

/** Regroupe des jours proposés par mois — le planning s'écrit mois par mois. */
export function parMois(jours: Record<string, TypeAffectation>): Record<string, Record<string, TypeAffectation>> {
  const groupes: Record<string, Record<string, TypeAffectation>> = {}
  for (const [date, affectation] of Object.entries(jours)) {
    const mois = moisDe(date)
    groupes[mois] = { ...(groupes[mois] ?? {}), [date]: affectation }
  }
  return groupes
}

// --- Pré-remplissage du pointage (§4 de doc/EPCM.docx) ---------------------

export interface PropositionPointage {
  employeId: string
  libelle: string
  /** Jours à poser — ceux **qui ne sont pas déjà pointés**. */
  aPoser: Record<string, PointageJourEpcm>
  /** Jours déjà pointés, laissés tels quels. */
  conserves: number
  /** Jours du planning volontairement écartés (congé, repos, absence). */
  ecartes: number
}

/**
 * Pré-remplit le pointage d'un mois depuis le planning (§4 : « le système
 * pré-remplit automatiquement les jours de présence ; les jours de congés
 * précédemment enregistrés sont exclus automatiquement ; l'utilisateur ne
 * corrige que les exceptions »).
 *
 * **Ce qui décide qu'un jour est posé, c'est la table `AFFECTATIONS`** : un
 * jour est proposé si son affectation compte comme travaillée. Congés, repos
 * et absences en sont exclus par construction — la règle n'est pas réécrite
 * ici, elle est lue là où elle vit déjà, et changer la table les changerait
 * tous les deux ensemble.
 *
 * **Un jour déjà pointé n'est jamais réécrit** : c'est le même garde-fou que
 * la génération du planning. Relancer le pré-remplissage ne perd aucune
 * correction.
 *
 * Chaque jour proposé vaut **une journée** (rev01, point Pointage : « elle
 * doit simplement renseigner le chiffre 1 »). Le paramètre d'heures a disparu
 * avec la saisie des heures : la journée vaut `HEURES_PAR_JOUR_POINTE`, et
 * les heures se déduisent du nombre de jours.
 *
 * Fonction **pure** : elle propose, elle n'écrit pas.
 */
export function preremplirPointage(
  employes: EmployeEpcm[],
  plannings: PlanningMoisEpcm[],
  pointages: PointageMoisEpcm[],
  mois: string
): PropositionPointage[] {
  return employes
    .map((employe) => {
      const planning = plannings.find((p) => p.employeId === employe.id && p.mois === mois)
      const pointage = pointages.find((p) => p.employeId === employe.id && p.mois === mois)
      const aPoser: Record<string, PointageJourEpcm> = {}
      let conserves = 0
      let ecartes = 0

      for (const [date, affectation] of Object.entries(planning?.jours ?? {})) {
        if (!AFFECTATIONS[affectation].travaille) {
          ecartes += 1
          continue
        }
        if (pointage?.jours[date]) {
          conserves += 1
          continue
        }
        aPoser[date] = {
          // Une journée de présence = 1 (rev01, point Pointage). Les heures ne
          // sont plus posées : elles se déduisent du nombre de jours.
          jours: 1,
          heuresTravaillees: null,
          heuresSupplementaires: null,
          retardMinutes: null,
          absent: false,
          commentaire: null,
          prerempli: true,
        }
      }

      return { employeId: employe.id, libelle: nomComplet(employe), aPoser, conserves, ecartes }
    })
    .filter((p) => Object.keys(p.aPoser).length > 0 || p.conserves > 0 || p.ecartes > 0)
}

/**
 * D'où vient le montant qu'une journée travaillée coûte :
 * - `SAISI` — le taux journalier de la fiche (intervenant sous agrément) ;
 * - `SALAIRE_MENSUEL` — déduit du salaire mensuel, faute de taux saisi
 *   (salarié CDI/CDD, dont l'étape « Coûts » ne demande plus de taux depuis le
 *   rev01) ;
 * - `null` — aucune rémunération renseignée : le coût est **inconnu**, pas nul.
 */
export type OrigineTauxJournalier = 'SAISI' | 'SALAIRE_MENSUEL'

const nbJoursDuMois = (mois: string) => joursDuMois(mois).length

export interface TauxJournalierEffectif {
  valeur: number | null
  origine: OrigineTauxJournalier | null
  /** Diviseur employé quand le taux est déduit du salaire mensuel. */
  joursDuMois: number
}

/**
 * Ce qu'une journée travaillée coûte, sur le mois considéré.
 *
 * **Pourquoi cette fonction existe** (27/08/2026, lot 2 du rev01) : le point 6
 * demande que l'étape « Coûts » s'adapte au type de contrat — taux journalier
 * pour un intervenant sous agrément, salaire mensuel pour un salarié. Masquer
 * simplement le taux journalier d'un CDI aurait mis **son coût pointé à zéro**
 * partout (coût engagé, prévisionnel, % consommé, marge), sans que rien ne le
 * dise. Le taux est donc *déduit* du salaire au lieu d'être perdu.
 *
 * Le diviseur est le **nombre de jours du mois considéré** — la formulation
 * exacte du document, qu'il emploie pour le forfait **vendu** (« calculer le
 * taux journalier en fonction du nombre de jours du mois considéré »). Le
 * document ne se prononce pas sur le côté **payé** : c'est la seule
 * extrapolation de ce lot, elle est affichée à l'écran avec son diviseur, et
 * posée en question Q13 du recueil plutôt que passée sous silence.
 *
 * `valeur = null` quand ni taux ni salaire ne sont renseignés — une
 * rémunération inconnue n'est pas une rémunération nulle.
 */
export function tauxJournalierEffectif(
  employe: Pick<EmployeEpcm, 'coutJournalier' | 'salaireBrut'>,
  mois: string
): TauxJournalierEffectif {
  const joursDuMois = nbJoursDuMois(mois)
  if (employe.coutJournalier != null) return { valeur: employe.coutJournalier, origine: 'SAISI', joursDuMois }
  if (employe.salaireBrut != null && joursDuMois > 0) {
    return { valeur: employe.salaireBrut / joursDuMois, origine: 'SALAIRE_MENSUEL', joursDuMois }
  }
  return { valeur: null, origine: null, joursDuMois }
}

/**
 * Taux journalier **vendu** au client : forfait mensuel ÷ nombre de jours du
 * mois considéré (rev01, point 6 — « Cette donnée permet notamment de calculer
 * le taux journalier en fonction du nombre de jours du mois considéré »).
 *
 * À ne pas confondre avec `tauxJournalierEffectif`, qui est ce que la personne
 * **coûte**. Les deux se ressemblent et disent l'inverse l'un de l'autre.
 */
export function tauxJournalierVendu(forfaitMensuel: number | null, mois: string): number | null {
  const jours = nbJoursDuMois(mois)
  if (forfaitMensuel == null || jours === 0) return null
  return forfaitMensuel / jours
}

export interface SyntheseEmployeEpcm {
  employe: EmployeEpcm
  joursParAffectation: Record<TypeAffectation, number>
  /** Jours travaillés planifiés sur l'ensemble du mois. */
  joursTravaillesPlanifies: number
  /** Jours travaillés jusqu'à la date d'arrêté incluse (pointage prioritaire). */
  joursTravaillesADate: number
  /** Jours travaillés planifiés après la date d'arrêté. */
  joursTravaillesRestants: number
  joursNonPlanifies: number
  /**
   * Jours non planifiés **que le régime de la personne attendait** — les
   * seuls qui signalent un vrai trou. Depuis que les jours OFF d'un cycle ne
   * sont plus posés (rev01), `joursNonPlanifies` en compte 28 par cycle, qui
   * ne manquent à personne. Vaut `joursNonPlanifies` quand le régime est
   * inconnu : on ne sait alors pas ce qui était attendu, et se taire
   * masquerait le cas où l'alerte est le plus utile.
   */
  joursNonPlanifiesAttendus: number
  heuresTravaillees: number
  heuresSupplementaires: number
  retardMinutes: number
  joursAbsence: number
  coutReel: number
  coutPrevisionnelFinMois: number
  venduMensuel: number
  quotaJoursRestants: number | null
  /**
   * La personne compte-t-elle dans l'effectif **à la date d'arrêté** ?
   * Dérivée du contrat depuis le rev01 (`estActif`) — le champ `statut` de la
   * fiche n'est plus qu'un forçage.
   */
  actif: boolean
  /** Ce qu'une journée coûte ce mois-ci — `null` si aucune rémunération n'est connue. */
  tauxJournalier: number | null
  /** D'où vient ce taux : saisi, ou déduit du salaire mensuel. */
  origineTauxJournalier: OrigineTauxJournalier | null
}

const AFFECTATIONS_VIDES = (): Record<TypeAffectation, number> =>
  Object.fromEntries(TYPES_AFFECTATION.map((t) => [t, 0])) as Record<TypeAffectation, number>

/**
 * Nombre de **journées facturables** que porte un pointage.
 *
 * La règle est celle du rev01, point Pointage : une journée vaut
 * `HEURES_PAR_JOUR_POINTE` heures, et les heures supplémentaires se comptent
 * en jours — « si une personne totalise l'équivalent de 18 heures (=6h
 * supplémentaire)=1,5 jour, elle sera facturée à hauteur d'un jour et demi
 * selon son taux journalier » ; « si une personne travaille avec 12 heures en
 * heure sup sur une même date, cela correspond à 2 jours pointés pour cette
 * date ».
 *
 * **Aucune migration n'est nécessaire** : un pointage antérieur au 27/08/2026
 * ne porte pas de `jours` mais des heures, relues ici à raison de 12 heures
 * par journée — ce qui redonne exactement les mêmes 1,5 jour pour 12 h + 6 h
 * de supplémentaires. Rien n'est réécrit en base, et un pointage en heures
 * garde le sens qu'il avait le jour où il a été saisi.
 */
export function joursPointes(pointe: PointageJourEpcm | undefined): number {
  if (!pointe || pointe.absent) return 0
  const base = pointe.jours ?? (pointe.heuresTravaillees ?? 0) / HEURES_PAR_JOUR_POINTE
  const supplementaires = (pointe.heuresSupplementaires ?? 0) / HEURES_PAR_JOUR_POINTE
  return base + supplementaires
}

/** Heures d'une journée pointée : jours × 12, jamais saisies (rev01). */
export function heuresDuPointage(pointe: PointageJourEpcm | undefined): number {
  return joursPointes(pointe) * HEURES_PAR_JOUR_POINTE
}

/**
 * Une journée compte-t-elle comme travaillée ?
 *
 * Règle : **le pointage prime sur le planning** quand il existe pour ce jour
 * — le planning dit ce qui était prévu, le pointage ce qui s'est passé. Un
 * jour pointé absent ne compte pas, un jour pointé avec des heures compte
 * même s'il n'était pas planifié (dépannage de dernière minute).
 */
export function jourTravaille(
  date: string,
  planning: PlanningMoisEpcm | undefined,
  pointage: PointageMoisEpcm | undefined
): boolean {
  const pointe = pointage?.jours[date]
  if (pointe) {
    if (pointe.absent) return false
    if (pointe.jours != null || pointe.heuresTravaillees != null) return joursPointes(pointe) > 0
  }
  const affectation = planning?.jours[date]
  return affectation ? AFFECTATIONS[affectation].travaille : false
}

/**
 * **Combien** de journées compte un jour donné — 1,5 quand des heures
 * supplémentaires portent la journée à 18 h, 2 quand elles la doublent.
 *
 * Le pointage prime sur le planning, comme pour `jourTravaille` ; un jour
 * seulement planifié vaut une journée pleine, faute de mieux.
 */
export function quantiteJourTravaille(
  date: string,
  planning: PlanningMoisEpcm | undefined,
  pointage: PointageMoisEpcm | undefined
): number {
  const pointe = pointage?.jours[date]
  if (pointe) {
    if (pointe.absent) return 0
    if (pointe.jours != null || pointe.heuresTravaillees != null) return joursPointes(pointe)
  }
  const affectation = planning?.jours[date]
  return affectation && AFFECTATIONS[affectation].travaille ? 1 : 0
}

/**
 * Décompte d'un employé sur une liste de jours quelconque — le mois pour les
 * synthèses, une semaine ou une seule journée pour les rapports (§11). Les
 * plannings et pointages sont indexés par mois pour qu'une période à cheval
 * sur deux mois se compte sans cas particulier.
 */
export interface CompteurPeriodeEpcm {
  parAffectation: Record<TypeAffectation, number>
  joursTravaillesPlanifies: number
  joursNonPlanifies: number
  heuresTravaillees: number
  heuresSupplementaires: number
  retardMinutes: number
  joursAbsence: number
}

export function compteSurPeriode(
  jours: string[],
  planningsParMois: Map<string, PlanningMoisEpcm>,
  pointagesParMois: Map<string, PointageMoisEpcm>
): CompteurPeriodeEpcm {
  const parAffectation = AFFECTATIONS_VIDES()
  let joursTravaillesPlanifies = 0
  let joursNonPlanifies = 0
  let heuresTravaillees = 0
  let heuresSupplementaires = 0
  let retardMinutes = 0
  let joursAbsence = 0

  for (const date of jours) {
    const affectation = planningsParMois.get(moisDe(date))?.jours[date]
    if (affectation) {
      parAffectation[affectation]++
      if (AFFECTATIONS[affectation].travaille) joursTravaillesPlanifies++
    } else {
      joursNonPlanifies++
    }
    const pointe = pointagesParMois.get(moisDe(date))?.jours[date]
    if (pointe) {
      // Heures dérivées du nombre de jours (rev01) — elles ne sont plus
      // saisies, et un pointage ancien les rend à l'identique.
      heuresTravaillees += heuresDuPointage(pointe)
      heuresSupplementaires += pointe.heuresSupplementaires ?? 0
      retardMinutes += pointe.retardMinutes ?? 0
      if (pointe.absent) joursAbsence++
    }
  }

  return {
    parAffectation,
    joursTravaillesPlanifies,
    joursNonPlanifies,
    heuresTravaillees,
    heuresSupplementaires,
    retardMinutes,
    joursAbsence,
  }
}

/** Jours travaillés d'un employé sur une période, pointage prioritaire. */
export function joursTravaillesSurPeriode(
  jours: string[],
  planningsParMois: Map<string, PlanningMoisEpcm>,
  pointagesParMois: Map<string, PointageMoisEpcm>
): number {
  return jours.reduce(
    (total, date) =>
      total + quantiteJourTravaille(date, planningsParMois.get(moisDe(date)), pointagesParMois.get(moisDe(date))),
    0
  )
}

/** Lundi → dimanche de la semaine contenant `date` (rapport hebdomadaire). */
export function semaineDe(date: string): { debut: string; fin: string } {
  const t = Date.parse(`${date}T00:00:00Z`)
  const jour = new Date(t).getUTCDay()
  const versLundi = (jour + 6) % 7
  const debut = new Date(t - versLundi * JOUR_MS).toISOString().slice(0, 10)
  const fin = new Date(t + (6 - versLundi) * JOUR_MS).toISOString().slice(0, 10)
  return { debut, fin }
}

/**
 * `forfaitParDefaut` — le forfait mensuel du contrat, appliqué à une personne
 * qui n'a pas le sien (rev01, R1-24/R1-32 : « Forfait mensuel vendu au
 * client » et « Budget mensuel facturé au client » sont **une seule donnée**,
 * portée par la fiche, celle du contrat n'en étant que la valeur par défaut).
 *
 * Sans lui, le forfait d'une personne était lu deux fois de deux façons : 0
 * dans sa ligne du tableau, mais la valeur du contrat dans le budget vendu
 * global — deux chiffres pour la même grandeur sur le même écran.
 */
export function syntheseEmploye(
  employe: EmployeEpcm,
  mois: string,
  planning: PlanningMoisEpcm | undefined,
  pointage: PointageMoisEpcm | undefined,
  dateArrete: string,
  forfaitParDefaut: number | null = null
): SyntheseEmployeEpcm {
  const jours = joursDuMois(mois)
  const planningsParMois = new Map(planning ? [[mois, planning]] : [])
  const pointagesParMois = new Map(pointage ? [[mois, pointage]] : [])
  const compteurs = compteSurPeriode(jours, planningsParMois, pointagesParMois)
  const {
    parAffectation: joursParAffectation,
    joursTravaillesPlanifies,
    joursNonPlanifies,
    heuresTravaillees,
    heuresSupplementaires,
    retardMinutes,
    joursAbsence,
  } = compteurs

  // Trous réels du planning : ceux que le régime attendait (cf. ci-dessus).
  const regime = regimeConnu(employe)
  const joursNonPlanifiesAttendus = regime
    ? jours.filter((date) => !planning?.jours[date] && affectationAttendue(employe, date) !== null).length
    : joursNonPlanifies

  let joursTravaillesADate = 0
  let joursTravaillesRestants = 0
  for (const date of jours) {
    if (date <= dateArrete) {
      // Quantité et non compte : une journée à 18 h vaut 1,5 jour facturé.
      joursTravaillesADate += quantiteJourTravaille(date, planning, pointage)
      continue
    }
    const affectation = planning?.jours[date]
    if (affectation && AFFECTATIONS[affectation].travaille) joursTravaillesRestants++
  }

  // Le taux journalier n'est plus lu directement sur la fiche : un salarié
  // n'en saisit plus (rev01, point 6), le sien se déduit de son salaire.
  const taux = tauxJournalierEffectif(employe, mois)
  const coutJournalier = taux.valeur ?? 0
  const coutReel = joursTravaillesADate * coutJournalier
  return {
    employe,
    joursParAffectation,
    joursTravaillesPlanifies,
    joursTravaillesADate,
    joursTravaillesRestants,
    joursNonPlanifies,
    joursNonPlanifiesAttendus,
    heuresTravaillees,
    heuresSupplementaires,
    retardMinutes,
    joursAbsence,
    coutReel,
    // Prévisionnel fin de mois (§8) = ce qui est déjà consommé + ce qui reste
    // planifié. Il ne suppose aucune journée au-delà du planning saisi.
    coutPrevisionnelFinMois: coutReel + joursTravaillesRestants * coutJournalier,
    venduMensuel: employe.coutMensuelVendu ?? forfaitParDefaut ?? 0,
    quotaJoursRestants: employe.quotaJoursMois == null ? null : employe.quotaJoursMois - joursTravaillesADate,
    actif: estActif(employe, dateArrete),
    tauxJournalier: taux.valeur,
    origineTauxJournalier: taux.origine,
  }
}

export function syntheseEquipe(
  employes: EmployeEpcm[],
  mois: string,
  plannings: PlanningMoisEpcm[],
  pointages: PointageMoisEpcm[],
  dateArrete: string,
  forfaitParDefaut: number | null = null
): SyntheseEmployeEpcm[] {
  const parEmployePlanning = new Map(plannings.filter((p) => p.mois === mois).map((p) => [p.employeId, p]))
  const parEmployePointage = new Map(pointages.filter((p) => p.mois === mois).map((p) => [p.employeId, p]))
  return employes.map((e) =>
    syntheseEmploye(e, mois, parEmployePlanning.get(e.id), parEmployePointage.get(e.id), dateArrete, forfaitParDefaut)
  )
}

// --- Suivi financier (§8) --------------------------------------------------

export interface SyntheseFinanciereEpcm {
  budgetVendu: number
  /** true si le budget vient du contrat, false s'il est la somme des forfaits. */
  budgetDuContrat: boolean
  coutEngage: number
  coutPrevisionnelFinMois: number
  coutRestant: number
  pctConsomme: number | null
  /** Budget − prévisionnel : positif = marge, négatif = dépassement attendu. */
  ecart: number
  joursConsommes: number
  joursRestants: number
  devise: string
}

export function syntheseFinanciere(
  syntheses: SyntheseEmployeEpcm[],
  contrat: ContratEpcmDoc | null
): SyntheseFinanciereEpcm {
  const actifs = syntheses.filter((s) => s.actif)
  // Budget vendu : celui du contrat s'il est renseigné, sinon la somme des
  // forfaits mensuels vendus des employés actifs (§8, « montant forfaitaire
  // mensuel vendu/personne »). Aucun montant n'est supposé.
  // `venduMensuel` porte déjà le repli sur le forfait du contrat (cf.
  // `syntheseEmploye`) : le refaire ici donnerait deux façons de lire la même
  // grandeur, qui finiraient par diverger.
  const sommeForfaits = actifs.reduce((t, s) => t + s.venduMensuel, 0)
  const budgetDuContrat = contrat?.budgetMensuel != null
  const budgetVendu = budgetDuContrat ? (contrat?.budgetMensuel ?? 0) : sommeForfaits

  const coutEngage = syntheses.reduce((t, s) => t + s.coutReel, 0)
  const coutPrevisionnelFinMois = syntheses.reduce((t, s) => t + s.coutPrevisionnelFinMois, 0)
  return {
    budgetVendu,
    budgetDuContrat,
    coutEngage,
    coutPrevisionnelFinMois,
    coutRestant: budgetVendu - coutEngage,
    pctConsomme: budgetVendu ? coutEngage / budgetVendu : null,
    ecart: budgetVendu - coutPrevisionnelFinMois,
    joursConsommes: syntheses.reduce((t, s) => t + s.joursTravaillesADate, 0),
    joursRestants: syntheses.reduce((t, s) => t + s.joursTravaillesRestants, 0),
    devise: contrat?.devise ?? 'XAF',
  }
}

// --- Tableau de bord (§10) -------------------------------------------------

// --- Facturation : la comparaison mensuelle du §7 --------------------------

/**
 * Ce que le collaborateur **coûte réellement** sur le mois (§7, « coût réel
 * payé aux collaborateurs »), à distinguer du « coût du personnel pointé ».
 *
 * **La règle vient du §6**, qui fait saisir deux formes de rémunération :
 * - *salaire mensuel* (CDI, CDD) — il est payé **quel que soit** le nombre de
 *   jours travaillés dans le mois. C'est un coût fixe.
 * - *taux journalier* (freelance sous agrément) — payé **au jour presté**.
 *
 * D'où l'écart que le §7 demande de regarder : un CDI à 18 jours pointés dans
 * un mois de 22 coûte le même salaire, alors que son coût *pointé* baisse.
 * Recopier l'un sur l'autre ferait disparaître exactement ce que la
 * comparaison cherche à montrer.
 *
 * `null` quand rien n'est renseigné — ni salaire, ni taux : une rémunération
 * inconnue n'est pas une rémunération nulle.
 */
export function coutReelPaye(employe: EmployeEpcm, joursTravailles: number): number | null {
  if (employe.salaireBrut != null) return employe.salaireBrut
  if (employe.coutJournalier != null) return employe.coutJournalier * joursTravailles
  return null
}

export interface ComparaisonMensuelle {
  /** Coût du personnel **pointé** : jours travaillés × taux journalier. */
  coutPointe: number
  /** Coût **réel payé** aux collaborateurs (salaire mensuel ou jours prestés). */
  coutPaye: number
  /** Collaborateurs dont la rémunération n'est pas renseignée. */
  sansRemuneration: number
  /** Montant **facturé au client** — lu sur les factures du module Contrats. */
  montantFacture: number | null
  /** **Budget client** : forfaits vendus, ou budget du contrat. */
  budgetClient: number
  devise: string
}

/**
 * Les **quatre montants** que le §7 demande de comparer mensuellement.
 *
 * Ils restent **quatre colonnes distinctes** et ne sont jamais fondus : les
 * additionner ou en déduire un des autres ferait disparaître l'écart que la
 * comparaison a précisément pour objet.
 *
 * `montantFacture` vaut `null` — et non `0` — tant que le contrat EPCM n'est
 * pas rattaché à un contrat du module Contrats : un montant facturé inconnu
 * n'est pas un montant facturé nul.
 */
export function comparaisonMensuelle(
  syntheses: SyntheseEmployeEpcm[],
  finance: SyntheseFinanciereEpcm,
  montantFacture: number | null
): ComparaisonMensuelle {
  const payes = syntheses.map((s) => coutReelPaye(s.employe, s.joursTravaillesADate))
  return {
    coutPointe: finance.coutEngage,
    coutPaye: payes.reduce<number>((t, v) => t + (v ?? 0), 0),
    sansRemuneration: payes.filter((v) => v === null).length,
    montantFacture,
    budgetClient: finance.budgetVendu,
    devise: finance.devise,
  }
}

/**
 * KPI « taux de consommation des jours commandés » (jours consommés ÷ jours
 * commandés × 100). `null` tant que les jours commandés ne sont pas
 * renseignés : sans dénominateur, il n'y a pas de taux — et en supposer un
 * donnerait un pourcentage d'apparence officielle assis sur rien.
 */
export function tauxConsommationJours(joursConsommes: number, joursCommandes: number | null): number | null {
  if (joursCommandes == null || joursCommandes <= 0) return null
  return joursConsommes / joursCommandes
}

export interface EtatJourEpcm {
  date: string
  parAffectation: Record<TypeAffectation, number>
  effectifTotal: number
  effectifActif: number
  surSite: number
  bureau: number
  rotation: number
  conges: number
  absents: number
  /** Actifs ni absents, ni en congé, ni en repos ce jour-là. */
  effectifDisponible: number
  nonPlanifies: number
}

export function etatDuJour(
  employes: EmployeEpcm[],
  plannings: PlanningMoisEpcm[],
  date: string
): EtatJourEpcm {
  const mois = moisDe(date)
  const parEmploye = new Map(plannings.filter((p) => p.mois === mois).map((p) => [p.employeId, p]))
  const parAffectation = AFFECTATIONS_VIDES()
  const actifs = employes.filter((e) => estActif(e, date))
  let nonPlanifies = 0

  for (const employe of actifs) {
    const affectation = parEmploye.get(employe.id)?.jours[date]
    if (!affectation) {
      nonPlanifies++
      continue
    }
    parAffectation[affectation]++
  }

  const absents = parAffectation.ABSENCE_JUSTIFIEE + parAffectation.ABSENCE_NON_JUSTIFIEE
  return {
    date,
    parAffectation,
    effectifTotal: employes.length,
    effectifActif: actifs.length,
    // « Sur site » inclut désormais la rotation (rev01) ; `rotation` reste
    // compté à part pour que l'écran puisse dire « dont n en rotation »
    // — sans quoi on ne saurait plus qui est en cycle 28/28.
    surSite: parAffectation.SITE + parAffectation.ROTATION,
    bureau: parAffectation.BUREAU,
    rotation: parAffectation.ROTATION,
    conges: parAffectation.CONGE,
    absents,
    effectifDisponible: actifs.length - absents - parAffectation.CONGE - parAffectation.REPOS,
    nonPlanifies,
  }
}

export interface TauxEpcm {
  /** Jours travaillés planifiés ÷ (effectif actif × jours du mois). */
  occupation: number | null
  /** Jours réellement travaillés ÷ jours travaillés planifiés, à date. */
  presence: number | null
}

export function tauxEquipe(syntheses: SyntheseEmployeEpcm[], mois: string): TauxEpcm {
  const actifs = syntheses.filter((s) => s.actif)
  const nbJours = joursDuMois(mois).length
  const capacite = actifs.length * nbJours
  // « À date » se lit dans les synthèses : planifiés − restants = la part du
  // planning déjà passée, sans avoir à re-parcourir le mois ici.
  const planifiesADate = actifs.reduce((t, s) => t + s.joursTravaillesPlanifies - s.joursTravaillesRestants, 0)
  const travaillesADate = actifs.reduce((t, s) => t + s.joursTravaillesADate, 0)
  return {
    occupation: capacite ? actifs.reduce((t, s) => t + s.joursTravaillesPlanifies, 0) / capacite : null,
    presence: planifiesADate ? travaillesADate / planifiesADate : null,
  }
}

/** Courbe journalière du mois : effectifs par affectation, pour le graphique. */
export function courbeDuMois(employes: EmployeEpcm[], plannings: PlanningMoisEpcm[], mois: string) {
  return joursDuMois(mois).map((date) => {
    const etat = etatDuJour(employes, plannings, date)
    return {
      date,
      jour: Number(date.slice(8)),
      Site: etat.surSite,
      Bureau: etat.bureau,
      Rotation: etat.rotation,
      Congé: etat.conges,
      Absent: etat.absents,
    }
  })
}

// --- Rotations (§6) --------------------------------------------------------

export interface RotationDerivee {
  rotation: RotationEpcm
  employe: EmployeEpcm | null
  joursTotal: number
  joursSite: number
  joursBureau: number
  joursRepos: number
  joursNonPlanifies: number
  /** Cycle constaté, ex. « 21 j site / 21 j repos ». */
  cycleConstate: string
  /** Terminée et intégralement planifiée. */
  complete: boolean
  terminee: boolean
}

/**
 * Décompte d'une rotation depuis le planning : les jours sur site, au bureau
 * et de repos ne sont pas saisis deux fois (§6), ils se comptent là où ils
 * ont été posés. Une rotation dont la période est passée mais dont des jours
 * n'ont jamais été planifiés est dite incomplète — c'est l'alerte « rotation
 * incomplète » du §9.
 */
export function rotationDerivee(
  rotation: RotationEpcm,
  employes: EmployeEpcm[],
  plannings: PlanningMoisEpcm[],
  dateArrete: string
): RotationDerivee {
  const jours = joursEntre(rotation.debut, rotation.fin)
  const parMois = new Map(plannings.filter((p) => p.employeId === rotation.employeId).map((p) => [p.mois, p]))
  let joursSite = 0
  let joursBureau = 0
  let joursRepos = 0
  let joursNonPlanifies = 0

  for (const date of jours) {
    const affectation = parMois.get(moisDe(date))?.jours[date]
    if (!affectation) {
      joursNonPlanifies++
      continue
    }
    if (affectation === 'SITE' || affectation === 'ROTATION') joursSite++
    else if (affectation === 'BUREAU') joursBureau++
    else if (affectation === 'REPOS' || affectation === 'CONGE') joursRepos++
  }

  const terminee = rotation.fin < dateArrete
  return {
    rotation,
    employe: employes.find((e) => e.id === rotation.employeId) ?? null,
    joursTotal: jours.length,
    joursSite,
    joursBureau,
    joursRepos,
    joursNonPlanifies,
    cycleConstate: `${joursSite} j site / ${joursRepos} j repos`,
    complete: joursNonPlanifies === 0,
    terminee,
  }
}

// --- HSE (§8 de doc/EPCM.docx) ---------------------------------------------

export interface SyntheseHseEpcm {
  /** Jours pointés sur la période — la base du calcul des heures. */
  joursPointes: number
  /** Jours pointés × 12 (§8), jamais saisi. */
  heuresTravaillees: number
  fat: number
  lti: number
  chse: number
  mtc: number
  fac: number
  hpi: number
  anomalies: number
  audits: number
  /** Fréquences pour 1 000 000 d'heures — formules partagées de types/hse.ts. */
  ltif: number
  trir: number
  hpif: number
  /** Événements ouverts au sens du tableau de bord : accidents et near-miss. */
  evenements: number
  /** Nombre de semaines relevées sur la période. */
  semaines: number
}

/**
 * Heures travaillées (§8) : « 1 jour pointé = 12 heures travaillées ».
 * *Exemple du document : 20 jours pointés = 240 heures.*
 */
export function heuresTravailleesEpcm(joursPointes: number): number {
  return joursPointes * HEURES_PAR_JOUR_POINTE
}

/**
 * Synthèse HSE d'une période : les compteurs saisis, **plus les heures
 * calculées** depuis le pointage, plus les trois fréquences.
 *
 * Les fréquences passent par `ltif` / `trir` / `hpif` de `types/hse.ts` — les
 * formules du classeur de référence, déjà utilisées ailleurs : les recopier
 * ici donnerait deux LTIF pouvant diverger. **Le TRIR est calculable ici**,
 * contrairement à la synthèse HSE du CRJ, parce que ce module saisit bien
 * CHSE et MTC.
 */
export function syntheseHse(saisies: SaisieHseEpcm[], joursPointes: number): SyntheseHseEpcm {
  const somme = (cle: keyof SaisieHseEpcm) =>
    saisies.reduce((t, s) => t + (typeof s[cle] === 'number' ? (s[cle] as number) : 0), 0)
  const compteurs = {
    fat: somme('fat'),
    lti: somme('lti'),
    chse: somme('chse'),
    mtc: somme('mtc'),
    fac: somme('fac'),
    hpi: somme('hpi'),
    anomalies: somme('anomalies'),
    audits: somme('audits'),
  }
  const heuresTravaillees = heuresTravailleesEpcm(joursPointes)
  const base = { ...compteurs, heuresTravaillees }
  return {
    joursPointes,
    ...base,
    ltif: ltif(base),
    trir: trir(base),
    hpif: hpif(base),
    // Ce que le tableau de bord appelle « alertes HSE ouvertes » : les
    // événements qui appellent une action. Les causeries et les audits sont
    // des actions de prévention, pas des incidents — les compter ferait
    // monter l'alerte quand la prévention progresse.
    evenements: compteurs.fat + compteurs.lti + compteurs.chse + compteurs.mtc + compteurs.fac + compteurs.hpi,
    semaines: saisies.length,
  }
}

/** Relevés d'un mois donné — la semaine est datée de son lundi. */
export function saisiesHseDuMois(saisies: SaisieHseEpcm[], mois: string): SaisieHseEpcm[] {
  return saisies.filter((s) => moisDe(s.semaine) === mois).sort((a, b) => a.semaine.localeCompare(b.semaine))
}

// --- Accueil : les six cartes et la chronologie de la note d'UX ------------
//
// « Beaucoup d'outils de suivi EPCM deviennent des usines à gaz parce qu'ils
// sont conçus comme des bases de données alors que les utilisateurs veulent
// voir immédiatement […]. Je dois comprendre la situation en moins de
// 10 secondes. » Tout ce qui suit est **dérivé** des données déjà là : rien
// ne se saisit pour alimenter l'accueil.

/** Délais de la vue « Alertes » : « contrats expirant dans 30 jours / 60 jours ». */
export const JOURS_ALERTE_CONTRAT_PROCHE = 30
export const JOURS_ALERTE_CONTRAT_ELOIGNE = 60

/** Écart en jours entre deux dates ISO. */
function ecartJours(de: string, a: string): number {
  return Math.round((new Date(a).getTime() - new Date(de).getTime()) / 86_400_000)
}

export interface EcheanceContrat {
  employe: EmployeEpcm
  /** Fin effective : contrat, ou dernier renouvellement (cf. finContratEffective). */
  fin: string
  /** Jours restants — négatif si l'échéance est passée. */
  jours: number
}

/**
 * Contrats de collaborateurs arrivant à échéance (note d'UX : « quels
 * contrats expirent ? », et les deux paliers 30 / 60 jours de la vue
 * Alertes).
 *
 * Ce sont bien les **contrats des collaborateurs** (§6) et non le contrat
 * EPCM : la vue Alertes les range à côté des visites médicales et des
 * habilitations, toutes choses attachées aux personnes.
 *
 * L'échéance retenue est la **fin effective** : un renouvellement repousse la
 * date, alerter sur la date initiale ferait sonner pour rien.
 */
export function echeancesContrats(
  employes: EmployeEpcm[],
  aujourdHui: string,
  dansJours: number
): EcheanceContrat[] {
  return employes
    .filter((e) => estActif(e, aujourdHui))
    .flatMap((employe) => {
      const fin = finContratEffective(employe)
      if (!fin) return []
      const jours = ecartJours(aujourdHui, fin)
      return jours <= dansJours ? [{ employe, fin, jours }] : []
    })
    .sort((a, b) => a.jours - b.jours)
}

/** Visites médicales expirées à cette date (§2 : validité de 12 mois). */
export function visitesMedicalesExpirees(employes: EmployeEpcm[], aujourdHui: string): EmployeEpcm[] {
  return employes.filter((e) => {
    if (!estActif(e, aujourdHui)) return false
    const expiration = expirationVisiteMedicale(e.dateVisiteMedicale)
    // Une visite **jamais renseignée** n'est pas une visite expirée : c'est
    // une information manquante, et les deux appellent des actions
    // différentes (aller chercher la date, ou faire repasser la visite).
    return expiration !== null && expiration < aujourdHui
  })
}

/** Employés portant au moins une habilitation expirée (§2). */
export function employesHabilitationsExpirees(
  employes: EmployeEpcm[],
  aujourdHui: string
): { employe: EmployeEpcm; expirees: HabilitationHse[] }[] {
  return employes
    .filter((e) => estActif(e, aujourdHui))
    .map((employe) => ({ employe, expirees: habilitationsExpirees(employe.habilitations, aujourdHui) }))
    .filter((x) => x.expirees.length > 0)
}

export type SensRotation = 'MONTE' | 'DESCEND'

export interface MouvementRotation {
  employe: EmployeEpcm
  date: string
  sens: SensRotation
}

/**
 * « Qui monte en rotation ? Qui descend ? » — les deux questions de la note
 * d'UX, lues **dans le planning** : un jour sur site précédé d'un jour qui ne
 * l'est pas est une montée, l'inverse une descente.
 *
 * Dérivé, jamais saisi : un mouvement déclaré à la main divergerait du
 * planning dès la première replanification.
 */
export function mouvementsRotation(
  employes: EmployeEpcm[],
  plannings: PlanningMoisEpcm[],
  depuis: string,
  jusqua: string
): MouvementRotation[] {
  const mouvements: MouvementRotation[] = []
  for (const employe of employes.filter((e) => estActif(e, depuis))) {
    const jours: Record<string, TypeAffectation> = {}
    for (const p of plannings.filter((p) => p.employeId === employe.id)) Object.assign(jours, p.jours)
    for (const date of joursEntre(depuis, jusqua)) {
      const veille = new Date(date)
      veille.setDate(veille.getDate() - 1)
      const cleVeille = veille.toISOString().slice(0, 10)
      const surSite = jours[date] ? AFFECTATIONS[jours[date]].surSite : false
      const surSiteVeille = jours[cleVeille] ? AFFECTATIONS[jours[cleVeille]].surSite : false
      if (surSite && !surSiteVeille) mouvements.push({ employe, date, sens: 'MONTE' })
      else if (!surSite && surSiteVeille) mouvements.push({ employe, date, sens: 'DESCEND' })
    }
  }
  return mouvements.sort((a, b) => a.date.localeCompare(b.date))
}

/** « Qui est sur quel site ? » — l'effectif présent, groupé par site. */
export function effectifParSite(
  employes: EmployeEpcm[],
  plannings: PlanningMoisEpcm[],
  date: string
): { site: string; employes: EmployeEpcm[] }[] {
  const groupes = new Map<string, EmployeEpcm[]>()
  for (const employe of employes.filter((e) => estActif(e, date))) {
    const planning = plannings.find((p) => p.employeId === employe.id && p.mois === moisDe(date))
    const affectation = planning?.jours[date]
    if (!affectation || !AFFECTATIONS[affectation].surSite) continue
    // Un site non renseigné forme son propre groupe plutôt que de disparaître :
    // la personne est bien sur site, c'est le site qui manque.
    const site = employe.site ?? 'Site non renseigné'
    groupes.set(site, [...(groupes.get(site) ?? []), employe])
  }
  return [...groupes.entries()]
    .map(([site, liste]) => ({ site, employes: liste }))
    .sort((a, b) => b.employes.length - a.employes.length)
}

export type TypeEvenement = 'MOBILISATION' | 'DEMOBILISATION' | 'ROTATION' | 'HSE' | 'CONTRAT'

export interface EvenementEpcm {
  date: string
  type: TypeEvenement
  libelle: string
}

/**
 * Chronologie des événements du contrat (note d'UX, piste 5 — ses exemples :
 * « 02/01 Mobilisation Stan · 15/01 Début rotation AGM · 05/02 Incident HSE ·
 * 20/02 Renouvellement contrat Armel »).
 *
 * **Entièrement dérivée** des données existantes — affectations, planning,
 * relevés HSE, renouvellements de contrat. Un journal saisi à la main
 * divergerait des faits dès la première omission. À ne pas confondre avec
 * l'onglet Historique, qui est un **journal d'audit** (qui a modifié quel
 * champ) et non une chronologie métier.
 */
export function chronologieEpcm(
  employes: EmployeEpcm[],
  plannings: PlanningMoisEpcm[],
  hse: SaisieHseEpcm[],
  depuis: string,
  jusqua: string
): EvenementEpcm[] {
  const evenements: EvenementEpcm[] = []
  const dans = (d: string | null) => d !== null && d >= depuis && d <= jusqua

  for (const employe of employes) {
    const nom = nomComplet(employe)
    if (dans(employe.dateDebutAffectation)) {
      evenements.push({ date: employe.dateDebutAffectation!, type: 'MOBILISATION', libelle: `Mobilisation ${nom}${employe.site ? ` — ${employe.site}` : ''}` })
    }
    if (dans(employe.dateFinAffectation)) {
      evenements.push({ date: employe.dateFinAffectation!, type: 'DEMOBILISATION', libelle: `Fin d'affectation ${nom}` })
    }
    for (const r of employe.renouvellements ?? []) {
      if (dans(r.debut)) evenements.push({ date: r.debut!, type: 'CONTRAT', libelle: `Renouvellement contrat ${nom}` })
    }
    if (dans(employe.dateFinContrat)) {
      evenements.push({ date: employe.dateFinContrat!, type: 'CONTRAT', libelle: `Fin de contrat ${nom}` })
    }
  }

  for (const m of mouvementsRotation(employes, plannings, depuis, jusqua)) {
    evenements.push({
      date: m.date,
      type: 'ROTATION',
      libelle: `${m.sens === 'MONTE' ? 'Début' : 'Fin'} rotation ${nomComplet(m.employe)}${m.employe.site ? ` — ${m.employe.site}` : ''}`,
    })
  }

  for (const s of hse) {
    if (!dans(s.semaine)) continue
    const incidents = s.fat + s.lti + s.chse + s.mtc + s.fac + s.hpi
    // Une semaine sans incident n'est pas un événement : la chronologie doit
    // rester lisible, elle ne liste que ce qui s'est passé.
    if (incidents > 0) {
      evenements.push({ date: s.semaine, type: 'HSE', libelle: `${incidents} événement(s) HSE — semaine du ${s.semaine}` })
    }
  }

  return evenements.sort((a, b) => b.date.localeCompare(a.date))
}

// --- Alertes (§9) ----------------------------------------------------------

const SEUIL_BUDGET_ATTENTION = 0.8
const SEUIL_BUDGET_ELEVE = 0.9

function alerte(
  id: string,
  niveau: NiveauAlerte,
  categorie: AlerteEpcm['categorie'],
  titre: string,
  detail: string,
  employeId: string | null = null
): AlerteEpcm {
  return { id, niveau, categorie, titre, detail, employeId }
}

/**
 * Les alertes du cahier des charges (§9). Les seuils de budget 80 % et 90 %
 * partagent le même orange (le CDS demande trois seuils mais seulement trois
 * couleurs, dont le rouge est réservé au dépassement) — leur libellé les
 * distingue.
 */
/**
 * Contexte des alertes ajoutées par la note d'UX (échéances de contrat,
 * aptitudes, absents, factures). Optionnel : `construireAlertes` reste
 * utilisable sans lui, elle rend alors les seules alertes du CDS d'origine.
 */
export interface ContexteAlertes {
  employes: EmployeEpcm[]
  aujourdHui: string
  /** Nombre d'absents du jour. */
  absents: number
  /** Factures impayées du contrat rattaché — `null` si aucun contrat lié. */
  facturesEnAttente: number | null
}

export function construireAlertes(
  syntheses: SyntheseEmployeEpcm[],
  finance: SyntheseFinanciereEpcm,
  rotations: RotationDerivee[],
  nomComplet: (employe: EmployeEpcm) => string,
  contexte?: ContexteAlertes
): AlerteEpcm[] {
  const alertes: AlerteEpcm[] = []

  // Budget — toujours présente, verte tant qu'on est sous les 80 %.
  if (finance.pctConsomme != null) {
    const pct = finance.pctConsomme
    const pourcent = `${Math.round(pct * 100)} %`
    if (pct > 1) {
      alertes.push(alerte('budget', 'critique', 'BUDGET', 'Budget dépassé', `${pourcent} du budget vendu consommé.`))
    } else if (pct >= SEUIL_BUDGET_ELEVE) {
      alertes.push(alerte('budget', 'attention', 'BUDGET', '90 % du budget atteint', `${pourcent} consommé — marge très réduite.`))
    } else if (pct >= SEUIL_BUDGET_ATTENTION) {
      alertes.push(alerte('budget', 'attention', 'BUDGET', '80 % du budget atteint', `${pourcent} consommé.`))
    } else {
      alertes.push(alerte('budget', 'ok', 'BUDGET', 'Budget sous contrôle', `${pourcent} consommé.`))
    }
  }

  if (finance.ecart < 0) {
    alertes.push(
      alerte(
        'previsionnel',
        'critique',
        'BUDGET',
        'Dépassement attendu en fin de mois',
        `Le planning en cours mène à ${Math.round(-finance.ecart).toLocaleString('fr-FR')} ${finance.devise} au-dessus du budget.`
      )
    )
  }

  for (const s of syntheses) {
    if (!s.actif) continue
    const qui = nomComplet(s.employe)

    if (s.employe.quotaJoursMois != null) {
      const quota = s.employe.quotaJoursMois
      const prevu = s.joursTravaillesADate + s.joursTravaillesRestants
      if (s.joursTravaillesADate > quota) {
        alertes.push(alerte(`quota-j-${s.employe.id}`, 'critique', 'QUOTA_JOURS', `${qui} — quota de jours dépassé`, `${s.joursTravaillesADate} jours travaillés pour un quota de ${quota}.`, s.employe.id))
      } else if (prevu > quota) {
        alertes.push(alerte(`quota-j-${s.employe.id}`, 'attention', 'QUOTA_JOURS', `${qui} — quota de jours bientôt dépassé`, `${prevu} jours prévus sur le mois pour un quota de ${quota}.`, s.employe.id))
      }
    }

    // Pas d'alerte de quota d'heures : le plafond mensuel d'heures a été
    // retiré (rev01, point 8). Seul le quota de jours est surveillé.

    if (s.joursParAffectation.ABSENCE_NON_JUSTIFIEE > 0) {
      alertes.push(alerte(`abs-${s.employe.id}`, 'attention', 'PLANNING', `${qui} — absence non justifiée`, `${s.joursParAffectation.ABSENCE_NON_JUSTIFIEE} jour(s) sur le mois.`, s.employe.id))
    }

    if (s.joursNonPlanifiesAttendus > 0) {
      alertes.push(alerte(`plan-${s.employe.id}`, 'attention', 'PLANNING', `${qui} — planning incomplet`, `${s.joursNonPlanifiesAttendus} jour(s) du mois sans affectation.`, s.employe.id))
    }
  }

  for (const r of rotations) {
    if (r.terminee && !r.complete) {
      alertes.push(
        alerte(
          `rot-${r.rotation.id}`,
          'attention',
          'ROTATION',
          `Rotation incomplète${r.employe ? ` — ${nomComplet(r.employe)}` : ''}`,
          `${r.joursNonPlanifies} jour(s) non planifié(s) entre le ${r.rotation.debut} et le ${r.rotation.fin}.`,
          r.rotation.employeId
        )
      )
    }
  }

  // --- Les regroupements de la vue « Alertes » de la note d'UX ------------
  // « Regrouper automatiquement : contrats expirant dans 30 jours, dans
  // 60 jours, visites médicales expirées, habilitations expirées, personnel
  // absent, factures en attente, projets en retard. »
  if (contexte) {
    const { employes, aujourdHui, facturesEnAttente, absents } = contexte

    for (const e of echeancesContrats(employes, aujourdHui, JOURS_ALERTE_CONTRAT_ELOIGNE)) {
      const qui = nomComplet(e.employe)
      if (e.jours < 0) {
        alertes.push(alerte(`contrat-${e.employe.id}`, 'critique', 'CONTRAT', `${qui} — contrat expiré`, `Échéance dépassée de ${-e.jours} jour(s) (${e.fin}).`, e.employe.id))
      } else {
        // Deux paliers, comme le demande le document — mais un seul niveau de
        // gravité par contrat : le même contrat ne doit pas produire deux
        // alertes à 30 et à 60 jours.
        const proche = e.jours <= JOURS_ALERTE_CONTRAT_PROCHE
        alertes.push(
          alerte(
            `contrat-${e.employe.id}`,
            proche ? 'critique' : 'attention',
            'CONTRAT',
            `${qui} — contrat à renouveler`,
            `Échéance dans ${e.jours} jour(s) (${e.fin}).`,
            e.employe.id
          )
        )
      }
    }

    for (const employe of visitesMedicalesExpirees(employes, aujourdHui)) {
      alertes.push(alerte(`visite-${employe.id}`, 'critique', 'VISITE_MEDICALE', `${nomComplet(employe)} — visite médicale expirée`, `Visite du ${employe.dateVisiteMedicale}, valable ${MOIS_VALIDITE_VISITE_MEDICALE} mois.`, employe.id))
    }

    for (const { employe, expirees } of employesHabilitationsExpirees(employes, aujourdHui)) {
      alertes.push(alerte(`habil-${employe.id}`, 'critique', 'HABILITATION', `${nomComplet(employe)} — habilitation(s) expirée(s)`, expirees.map((h) => h.libelle).join(', '), employe.id))
    }

    if (absents > 0) {
      alertes.push(alerte('absents', 'attention', 'ABSENCE', 'Personnel absent', `${absents} personne(s) absente(s) aujourd'hui.`))
    }

    // `null` = information indisponible (contrat EPCM non rattaché au module
    // Contrats) : on ne dit rien plutôt que d'annoncer « 0 facture en
    // attente », ce qui serait rassurant et faux.
    if (facturesEnAttente !== null && facturesEnAttente > 0) {
      alertes.push(alerte('factures', 'attention', 'FACTURE', 'Factures en attente', `${facturesEnAttente} facture(s) impayée(s) sur le contrat rattaché.`))
    }
  }

  const ordre: Record<NiveauAlerte, number> = { critique: 0, attention: 1, ok: 2 }
  return alertes.sort((a, b) => ordre[a.niveau] - ordre[b.niveau])
}

export const CLASSES_ALERTE: Record<NiveauAlerte, { carte: string; pastille: string; texte: string }> = {
  ok: { carte: 'bg-green-50 border-green-200', pastille: 'bg-green-500', texte: 'text-green-700' },
  attention: { carte: 'bg-orange-50 border-orange-200', pastille: 'bg-orange-500', texte: 'text-orange-700' },
  critique: { carte: 'bg-red-50 border-red-200', pastille: 'bg-red-500', texte: 'text-red-700' },
}

export function nomComplet(employe: EmployeEpcm): string {
  return `${employe.prenom} ${employe.nom}`.trim()
}
