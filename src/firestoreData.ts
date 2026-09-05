import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, JOURNAUX } from './firestoreCollections'

// Remplace l'ancien client HTTP (lib/api.ts, API NestJS abandonnée le
// 22/07/2026) pour les deux familles de routes en simple lecture : blobs
// opaques (`GET /donnees/:cle`) et journaux (`GET /journaux/:cle`).

/** Blob opaque (`donnees_referentiels/{cle}`) : `valeur` est du JSON encodé
 * en string (certaines grilles sont des tableaux de tableaux, refusés
 * nativement par Firestore) — décodé ici, transparent pour l'appelant. */
export async function chargerDonnee<T>(cle: string): Promise<T> {
  const snap = await getDoc(doc(db, COLLECTIONS.donneesReferentiels, cle))
  if (!snap.exists()) throw new Error(`Donnée introuvable : ${cle}`)
  return JSON.parse((snap.data() as { valeur: string }).valeur) as T
}

/** Journal (une ligne = un document) : renvoie tous les docs de la collection. */
export async function chargerJournalCollection<T>(collectionName: string): Promise<T[]> {
  const snap = await getDocs(collection(db, collectionName))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
}

/** Journal désigné par sa clé (ex `GET /journaux/:cle` de l'ex-API). */
export async function chargerJournal<T>(cle: string): Promise<T[]> {
  const collectionName = JOURNAUX[cle]
  if (!collectionName) throw new Error(`Journal inconnu : ${cle} (disponibles : ${Object.keys(JOURNAUX).join(', ')})`)
  return chargerJournalCollection<T>(collectionName)
}
