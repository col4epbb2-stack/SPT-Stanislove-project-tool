import { collection, doc, getDocs, limit, orderBy, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { surveillerChargement } from './incidents'
import { COLLECTIONS, idDocument } from './firestoreCollections'
import type {
  ContratEpcmDoc,
  EmployeEpcm,
  EntiteEpcm,
  EntreeHistoriqueEpcm,
  PlanningMoisEpcm,
  PointageJourEpcm,
  PointageMoisEpcm,
  ProfilEpcm,
  RoleEpcm,
  RotationEpcm,
  SaisieHseEpcm,
  TypeAffectation,
} from '../types/contratEpcm'

// Accès Firestore du module Contrat EPCM (08/08/2026). Toutes les écritures
// passent par ce fichier parce que TOUTES doivent être historisées (§12) :
// laisser un composant écrire directement reviendrait tôt ou tard à une
// modification sans trace.
//
// L'historique est écrit dans le même `writeBatch` que la donnée : soit les
// deux passent, soit aucun — un journal d'audit qui peut diverger de ce qu'il
// audite ne vaut rien.

export interface AuteurEpcm {
  id: string
  nom: string
}

export interface DonneesEpcm {
  employes: EmployeEpcm[]
  plannings: PlanningMoisEpcm[]
  pointages: PointageMoisEpcm[]
  rotations: RotationEpcm[]
  contrats: ContratEpcmDoc[]
  /** Relevés HSE hebdomadaires (§8). */
  hse: SaisieHseEpcm[]
  profils: ProfilEpcm[]
  historique: EntreeHistoriqueEpcm[]
}

// L'échec de lecture est signalé (bandeau d'incident) mais ne rejette pas :
// les règles Firestore du module ne sont pas déployées (cf. CLAUDE.md) et un
// permission-denied bloquerait la page entière sur « Chargement… ». Il était
// jusqu'au 13/08/2026 simplement avalé, ce qui rendait un module entier
// inaccessible sous les apparences d'un module vide — d'autant plus trompeur
// ici que le contrat EPCM n'a aucune donnée importée : vide est son état
// normal au premier lancement.
//
// Un libellé unique pour les 7 collections : le bandeau dédoublonne par
// libellé, et la cause est toujours la même.
async function lire<T>(nomCollection: string): Promise<T[]> {
  const snap = await surveillerChargement(
    'Les données du contrat EPCM',
    getDocs(collection(db, nomCollection)),
    null
  )
  return snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T) : []
}

const MAX_HISTORIQUE = 500

/**
 * Complète une fiche employé des champs ajoutés le 26/08/2026 (§2 et §6 de
 * `doc/EPCM.docx` : discipline, affectation, aptitudes, contrat de travail).
 *
 * **Aucune migration n'est nécessaire grâce à ça** : les fiches déjà en base
 * n'ont tout simplement pas ces clés, et sans cette normalisation le reste du
 * code devrait se méfier du type à chaque lecture — ou pire, croire le type
 * et planter sur un `habilitations.length`. Les valeurs posées sont des
 * **absences** (`null`, liste vide), jamais des valeurs de substitution.
 */
function normaliserEmploye(employe: EmployeEpcm): EmployeEpcm {
  // Champ par champ, et non un spread de valeurs par défaut : le type
  // déclare ces clés comme présentes, donc TypeScript considérerait que le
  // spread de la fiche les écrase toujours — alors que ce sont précisément
  // les clés qui manquent en base.
  return {
    ...employe,
    discipline: employe.discipline ?? null,
    typeAffectation: employe.typeAffectation ?? null,
    dateDebutAffectation: employe.dateDebutAffectation ?? null,
    dateFinAffectation: employe.dateFinAffectation ?? null,
    binomeId: employe.binomeId ?? null,
    dateVisiteMedicale: employe.dateVisiteMedicale ?? null,
    habilitations: employe.habilitations ?? [],
    dateDebutContrat: employe.dateDebutContrat ?? null,
    dateFinContrat: employe.dateFinContrat ?? null,
    renouvellements: employe.renouvellements ?? [],
    statutSignature: employe.statutSignature ?? null,
    salaireBrut: employe.salaireBrut ?? null,
    salaireNet: employe.salaireNet ?? null,
    deviseSalaire: employe.deviseSalaire ?? null,
  }
}

export async function chargerDonneesEpcm(): Promise<DonneesEpcm> {
  const [employes, plannings, pointages, rotations, contrats, hse, profils, historique] = await Promise.all([
    lire<EmployeEpcm>(COLLECTIONS.epcmEmployes).then((liste) => liste.map(normaliserEmploye)),
    lire<PlanningMoisEpcm>(COLLECTIONS.epcmPlanning),
    lire<PointageMoisEpcm>(COLLECTIONS.epcmPointages),
    lire<RotationEpcm>(COLLECTIONS.epcmRotations),
    lire<ContratEpcmDoc>(COLLECTIONS.epcmContrats),
    lire<SaisieHseEpcm>(COLLECTIONS.epcmHse),
    lire<ProfilEpcm>(COLLECTIONS.epcmProfils),
    // L'historique grossit sans fin : seules les 500 dernières entrées sont
    // chargées, l'écran les affiche du plus récent au plus ancien.
    getDocs(query(collection(db, COLLECTIONS.epcmHistorique), orderBy('horodatage', 'desc'), limit(MAX_HISTORIQUE)))
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EntreeHistoriqueEpcm))
      .catch(() => [] as EntreeHistoriqueEpcm[]),
  ])
  return { employes, plannings, pointages, rotations, contrats, hse, profils, historique }
}

// --- Historique ------------------------------------------------------------

type Modification = { champ: string; ancienneValeur: string | null; nouvelleValeur: string | null }

function texte(valeur: unknown): string | null {
  if (valeur == null || valeur === '') return null
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non'
  return String(valeur)
}

/** Différences champ à champ entre deux versions d'un même objet. */
export function differences<T extends object>(avant: T | null, apres: T, ignorer: string[] = ['id']): Modification[] {
  const cles = new Set([...Object.keys(apres), ...(avant ? Object.keys(avant) : [])])
  const mods: Modification[] = []
  for (const champ of cles) {
    if (ignorer.includes(champ)) continue
    const ancienne = texte(avant ? (avant as Record<string, unknown>)[champ] : null)
    const nouvelle = texte((apres as Record<string, unknown>)[champ])
    if (ancienne !== nouvelle) mods.push({ champ, ancienneValeur: ancienne, nouvelleValeur: nouvelle })
  }
  return mods
}

function entreesHistorique(
  auteur: AuteurEpcm,
  entite: EntiteEpcm,
  entiteId: string,
  libelle: string,
  modifications: Modification[]
): EntreeHistoriqueEpcm[] {
  const horodatage = new Date().toISOString()
  return modifications.map((m) => ({
    id: crypto.randomUUID(),
    horodatage,
    utilisateurId: auteur.id,
    utilisateurNom: auteur.nom,
    entite,
    entiteId,
    libelle,
    ...m,
  }))
}

function ecrireHistorique(batch: ReturnType<typeof writeBatch>, entrees: EntreeHistoriqueEpcm[]) {
  for (const entree of entrees) {
    const { id, ...donnees } = entree
    batch.set(doc(db, COLLECTIONS.epcmHistorique, id), donnees)
  }
}

// --- Personnel -------------------------------------------------------------

export type EmployeInput = Omit<EmployeEpcm, 'id'>

export async function enregistrerEmploye(
  input: EmployeInput,
  initial: EmployeEpcm | null,
  auteur: AuteurEpcm
): Promise<EmployeEpcm> {
  const id = initial?.id ?? crypto.randomUUID()
  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmEmployes, id), input)
  const libelle = `${input.prenom} ${input.nom}`.trim()
  const mods = initial
    ? differences(initial, { id, ...input })
    : [{ champ: 'création', ancienneValeur: null, nouvelleValeur: libelle }]
  ecrireHistorique(batch, entreesHistorique(auteur, 'EMPLOYE', id, libelle, mods))
  await batch.commit()
  return { id, ...input }
}

// --- Planning --------------------------------------------------------------

export function idPlanning(employeId: string, mois: string): string {
  return idDocument(mois, employeId)
}

/**
 * Applique des changements d'affectation sur un mois. `null` retire le jour
 * du planning (case remise à vide). Les jours inchangés ne produisent pas
 * d'entrée d'historique.
 */
export async function enregistrerJoursPlanning(
  employeId: string,
  mois: string,
  changements: Record<string, TypeAffectation | null>,
  existant: PlanningMoisEpcm | undefined,
  libelleEmploye: string,
  auteur: AuteurEpcm
): Promise<PlanningMoisEpcm> {
  const jours: Record<string, TypeAffectation> = { ...(existant?.jours ?? {}) }
  const mods: Modification[] = []
  for (const [date, affectation] of Object.entries(changements)) {
    const ancienne = jours[date] ?? null
    if (ancienne === affectation) continue
    if (affectation === null) delete jours[date]
    else jours[date] = affectation
    mods.push({ champ: date, ancienneValeur: ancienne, nouvelleValeur: affectation })
  }
  const id = existant?.id ?? idPlanning(employeId, mois)
  const document: Omit<PlanningMoisEpcm, 'id'> = { employeId, mois, jours }

  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmPlanning, id), document)
  if (mods.length > 0) {
    ecrireHistorique(batch, entreesHistorique(auteur, 'PLANNING', id, `Planning ${libelleEmploye} — ${mois}`, mods))
  }
  await batch.commit()
  return { id, ...document }
}

// --- Pointage --------------------------------------------------------------

/**
 * Pose plusieurs jours de pointage d'un coup, pour un employé et un mois
 * (§4, pré-remplissage). Une seule écriture par employé au lieu d'une par
 * jour — un mois complet ferait sinon une trentaine d'écritures et autant
 * d'entrées d'audit pour un seul geste.
 *
 * **Les jours déjà pointés ne sont pas touchés** : l'appelant ne propose que
 * ce qui manque (cf. `preremplirPointage`), et ce `set` repart de l'existant.
 * L'historique reçoit **une entrée récapitulative** et non une par jour :
 * c'est un geste unique, le détail des jours est dans le pointage lui-même.
 */
export async function enregistrerJoursPointage(
  employeId: string,
  mois: string,
  nouveaux: Record<string, PointageJourEpcm>,
  existant: PointageMoisEpcm | undefined,
  libelleEmploye: string,
  auteur: AuteurEpcm
): Promise<PointageMoisEpcm> {
  const jours = { ...(existant?.jours ?? {}) }
  const poses: string[] = []
  for (const [date, valeurs] of Object.entries(nouveaux)) {
    if (jours[date]) continue
    jours[date] = valeurs
    poses.push(date)
  }
  const id = existant?.id ?? idDocument(mois, employeId)
  const document: Omit<PointageMoisEpcm, 'id'> = { employeId, mois, jours }

  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmPointages, id), document)
  if (poses.length > 0) {
    ecrireHistorique(
      batch,
      entreesHistorique(auteur, 'POINTAGE', id, `Pointage ${libelleEmploye} — ${mois}`, [
        { champ: 'pré-remplissage', ancienneValeur: null, nouvelleValeur: `${poses.length} jour(s)` },
      ])
    )
  }
  await batch.commit()
  return { id, ...document }
}

export async function enregistrerPointageJour(
  employeId: string,
  mois: string,
  date: string,
  valeurs: PointageJourEpcm,
  existant: PointageMoisEpcm | undefined,
  libelleEmploye: string,
  auteur: AuteurEpcm
): Promise<PointageMoisEpcm> {
  const jours = { ...(existant?.jours ?? {}), [date]: valeurs }
  const id = existant?.id ?? idDocument(mois, employeId)
  const document: Omit<PointageMoisEpcm, 'id'> = { employeId, mois, jours }

  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmPointages, id), document)
  const mods = differences(existant?.jours[date] ?? null, valeurs, [])
  if (mods.length > 0) {
    ecrireHistorique(batch, entreesHistorique(auteur, 'POINTAGE', id, `Pointage ${libelleEmploye} — ${date}`, mods))
  }
  await batch.commit()
  return { id, ...document }
}

/**
 * Import de pointages (§5) : un lot de journées déjà rapprochées d'un
 * employé. Une écriture par employé/mois concerné, et une entrée d'historique
 * par lot plutôt que par cellule — un import de 300 lignes ne doit pas noyer
 * le journal d'audit.
 */
export async function importerPointages(
  lots: { employeId: string; mois: string; libelleEmploye: string; jours: Record<string, PointageJourEpcm> }[],
  existants: PointageMoisEpcm[],
  auteur: AuteurEpcm
): Promise<PointageMoisEpcm[]> {
  const batch = writeBatch(db)
  const resultats: PointageMoisEpcm[] = []
  for (const lot of lots) {
    const existant = existants.find((p) => p.employeId === lot.employeId && p.mois === lot.mois)
    const jours = { ...(existant?.jours ?? {}), ...lot.jours }
    const id = existant?.id ?? idDocument(lot.mois, lot.employeId)
    const document: Omit<PointageMoisEpcm, 'id'> = { employeId: lot.employeId, mois: lot.mois, jours }
    batch.set(doc(db, COLLECTIONS.epcmPointages, id), document)
    ecrireHistorique(
      batch,
      entreesHistorique(auteur, 'POINTAGE', id, `Import pointage ${lot.libelleEmploye} — ${lot.mois}`, [
        { champ: 'import', ancienneValeur: null, nouvelleValeur: `${Object.keys(lot.jours).length} jour(s)` },
      ])
    )
    resultats.push({ id, ...document })
  }
  await batch.commit()
  return resultats
}

// --- Rotations -------------------------------------------------------------

export type RotationInput = Omit<RotationEpcm, 'id'>

export async function enregistrerRotation(
  input: RotationInput,
  initiale: RotationEpcm | null,
  libelleEmploye: string,
  auteur: AuteurEpcm
): Promise<RotationEpcm> {
  const id = initiale?.id ?? crypto.randomUUID()
  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmRotations, id), input)
  const mods = initiale
    ? differences(initiale, { id, ...input })
    : [{ champ: 'création', ancienneValeur: null, nouvelleValeur: `${input.debut} → ${input.fin}` }]
  ecrireHistorique(batch, entreesHistorique(auteur, 'ROTATION', id, `Rotation ${libelleEmploye}`, mods))
  await batch.commit()
  return { id, ...input }
}

export async function supprimerRotation(rotation: RotationEpcm, libelleEmploye: string, auteur: AuteurEpcm): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, COLLECTIONS.epcmRotations, rotation.id))
  ecrireHistorique(
    batch,
    entreesHistorique(auteur, 'ROTATION', rotation.id, `Rotation ${libelleEmploye}`, [
      { champ: 'suppression', ancienneValeur: `${rotation.debut} → ${rotation.fin}`, nouvelleValeur: null },
    ])
  )
  await batch.commit()
}

// --- Contrat ---------------------------------------------------------------

export type ContratInput = Omit<ContratEpcmDoc, 'id'>

export async function enregistrerContrat(
  input: ContratInput,
  initial: ContratEpcmDoc | null,
  auteur: AuteurEpcm
): Promise<ContratEpcmDoc> {
  const id = initial?.id ?? idDocument(input.reference)
  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmContrats, id), input)
  const mods = initial
    ? differences(initial, { id, ...input })
    : [{ champ: 'création', ancienneValeur: null, nouvelleValeur: input.reference }]
  ecrireHistorique(batch, entreesHistorique(auteur, 'CONTRAT', id, `Contrat ${input.reference}`, mods))
  await batch.commit()
  return { id, ...input }
}

export async function supprimerContrat(contrat: ContratEpcmDoc, auteur: AuteurEpcm): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, COLLECTIONS.epcmContrats, contrat.id))
  ecrireHistorique(
    batch,
    entreesHistorique(auteur, 'CONTRAT', contrat.id, `Contrat ${contrat.reference}`, [
      { champ: 'suppression', ancienneValeur: contrat.reference, nouvelleValeur: null },
    ])
  )
  await batch.commit()
}

// --- Profils d'accès (§13) -------------------------------------------------

export async function enregistrerProfil(
  uid: string,
  role: RoleEpcm,
  ancien: RoleEpcm | null,
  libelleUtilisateur: string,
  auteur: AuteurEpcm
): Promise<ProfilEpcm> {
  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmProfils, uid), { role })
  ecrireHistorique(
    batch,
    entreesHistorique(auteur, 'PROFIL', uid, `Profil EPCM — ${libelleUtilisateur}`, [
      { champ: 'role', ancienneValeur: ancien, nouvelleValeur: role },
    ])
  )
  await batch.commit()
  return { id: uid, role }
}

export async function retirerProfil(uid: string, ancien: RoleEpcm, libelleUtilisateur: string, auteur: AuteurEpcm): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, COLLECTIONS.epcmProfils, uid))
  ecrireHistorique(
    batch,
    entreesHistorique(auteur, 'PROFIL', uid, `Profil EPCM — ${libelleUtilisateur}`, [
      { champ: 'role', ancienneValeur: ancien, nouvelleValeur: null },
    ])
  )
  await batch.commit()
}

// Note : aucun employé ne se supprime — il se désactive (statut INACTIF) pour
// que son historique de planning et de coûts reste lisible. La suppression
// n'existe que pour les rotations et les contrats, où la donnée n'a pas de
// passé à préserver.

// --- HSE (§8) --------------------------------------------------------------

export type SaisieHseInput = Omit<SaisieHseEpcm, 'id'>

/**
 * Enregistre le relevé HSE d'une semaine (§8).
 *
 * **Doc ID = le lundi de la semaine** : réenregistrer la même semaine met à
 * jour le relevé au lieu d'empiler des doublons — un incident ne doit pas
 * compter deux fois parce que la saisie a été reprise. Même convention que
 * la consommation mensuelle d'un contrat.
 */
export async function enregistrerSaisieHse(
  input: SaisieHseInput,
  initial: SaisieHseEpcm | null,
  auteur: AuteurEpcm
): Promise<SaisieHseEpcm> {
  const id = idDocument(input.semaine)
  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.epcmHse, id), input)
  const mods = initial
    ? differences(initial, { id, ...input })
    : [{ champ: 'création', ancienneValeur: null, nouvelleValeur: `Relevé HSE du ${input.semaine}` }]
  ecrireHistorique(batch, entreesHistorique(auteur, 'HSE', id, `HSE — semaine du ${input.semaine}`, mods))
  await batch.commit()
  return { id, ...input }
}

/**
 * Suppression définitive d'un relevé HSE hebdomadaire (04/09/2026, demande
 * explicite). Contrairement à un employé (jamais supprimé, seulement
 * désactivé), un relevé HSE n'a pas d'historique propre à préserver au-delà
 * de la trace d'audit déjà écrite dans `epcm_historique` — même régime que
 * la suppression d'une rotation ou d'un contrat EPCM.
 */
export async function supprimerSaisieHse(saisie: SaisieHseEpcm, auteur: AuteurEpcm): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, COLLECTIONS.epcmHse, saisie.id))
  ecrireHistorique(
    batch,
    entreesHistorique(auteur, 'HSE', saisie.id, `HSE — semaine du ${saisie.semaine}`, [
      { champ: 'suppression', ancienneValeur: saisie.semaine, nouvelleValeur: null },
    ])
  )
  await batch.commit()
}
