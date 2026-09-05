import { getDocs, collection, doc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS } from '../lib/firestoreCollections'
import type { Projet } from '../types/project'
import type { Planning } from '../types/planning'
import type { AncienSnapshotHSE } from '../types/hse'

// Doc Firestore : mêmes champs que Projet, sauf `champ` porté comme
// `champCode` (transposition du schéma de l'ex-API NestJS, cf. CLAUDE.md).
interface ProjetDoc extends Omit<Projet, 'champ' | 'id'> {
  champCode?: string
}

// Avant le correctif du 27/07/2026 (cf. lib/planning.ts createDefaultPlanning),
// forecast/reel étaient créés avec des id indépendants de la baseline — les
// 3 vues ne référençaient donc pas les mêmes tâches. Reconstitué ici par
// position : les 3 tableaux ont toujours été construits par un simple
// `.map()` de la baseline (même ordre, même longueur), aucune tâche n'a pu y
// être ajoutée/retirée indépendamment avant l'existence du CRUD planning —
// aligner par index est donc fiable, pas une correspondance devinée.
function normaliserPlanning(planning: Planning): Planning {
  const reindexer = (vue: typeof planning.baseline) =>
    vue.length === planning.baseline.length ? vue.map((t, i) => ({ ...t, id: planning.baseline[i].id })) : vue
  return { ...planning, forecast: reindexer(planning.forecast), reel: reindexer(planning.reel) }
}

// Les 20 fiches projet (planning, HSE, procurement, contrats embarqués…),
// lues directement dans Firestore (collection `projets`, import-mock.ts +
// import-projets-complets.ts côté ex-API) plutôt que le mock local
// (Phase 3 du document de liaison — dérivation depuis les journaux réels
// pas encore faite, ceci sert la copie figée).
export async function chargerProjets(): Promise<Projet[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.projets))
  return snap.docs.map((d) => {
    const { champCode, ...reste } = d.data() as ProjetDoc
    // `hse` est passé d'un snapshot unique à un historique de saisies
    // mensuelles (27/07/2026, cf. types/hse.ts) — les fiches déjà en base
    // portent encore l'ancien objet, incompatible avec le tableau attendu
    // (plante au spread dans HSETab). Pas de conversion possible (l'ancien
    // format n'a pas de granularité mensuelle, et son nombreIncidents/
    // nombreQuasiAccidents combinaient déjà plusieurs catégories du nouveau
    // modèle — les répartir reviendrait à inventer une donnée) : préservé
    // tel quel en lecture seule (ancienSnapshotHSE) plutôt que perdu.
    const hseBrut = reste.hse as unknown
    const hse = Array.isArray(hseBrut) ? hseBrut : []
    const ancienSnapshotHSE = !Array.isArray(hseBrut) && hseBrut ? (hseBrut as AncienSnapshotHSE) : undefined
    const planning = normaliserPlanning(reste.planning)
    return { ...reste, hse, ancienSnapshotHSE, planning, id: d.id, champ: champCode } as Projet
  })
}

// Firestore rejette tout champ à `undefined`, y compris imbriqué (déjà
// rencontré sur les arbitrages navette) — Projet a de nombreux champs
// optionnels (avisNumero, ddmClasse, champ, Commande.fournisseur…), le
// round-trip JSON les supprime récursivement avant écriture.
function sansUndefined<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur))
}

export async function sauvegarderProjet(projet: Projet): Promise<void> {
  const { id, champ, ...reste } = projet
  // Les commandes de la collection `commandes` (25/08/2026, doc/module
  // contrat.docx §3) sont **réinjectées** dans `projet.commandes` à la lecture
  // pour que les ~20 écrans qui les lisent n'aient pas à changer. Elles
  // doivent donc être retirées avant d'écrire la fiche : sans ce filtre,
  // chaque sauvegarde les recopierait dans le document et elles compteraient
  // double (une fois dans la collection, une fois dans la fiche).
  // Les commandes restées inline — celles d'avant la migration — sont
  // réécrites telles quelles : rien n'est perdu.
  const commandes = reste.commandes.filter((c) => c.source !== 'collection')
  const docData = sansUndefined({ ...reste, commandes, champCode: champ })
  await setDoc(doc(db, COLLECTIONS.projets, id), docData)
}
