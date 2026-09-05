import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { signalerIncident } from './incidents'
import { COLLECTIONS, SOUS_COLLECTION_MESSAGES } from './firestoreCollections'
import type { MessageDiscussion, NouveauSujetInput, SujetDiscussion } from '../types/discussion'

// Accès Firestore du module Discussions. Seul module de l'app à s'abonner en
// temps réel (`onSnapshot`) plutôt qu'à charger une fois au montage
// (`getDocs`, cf. lib/firestoreData.ts) : une conversation dont les messages
// n'arrivent qu'au rechargement de la page n'est pas une conversation. Le
// coût est borné — les fils sont courts, contrairement aux journaux métier
// (7 911 lignes de tonnage) qui, eux, restent en lecture ponctuelle.
//
// Horodatages en ISO client (`new Date().toISOString()`), comme partout
// ailleurs dans l'app (PieceJointe.ajouteLe, arbitrages…) plutôt qu'un
// `serverTimestamp()` : deux messages postés dans la même seconde depuis des
// postes aux horloges décalées peuvent s'afficher dans le désordre. Assumé
// ici, l'échange étant asynchrone (pas une messagerie instantanée).

const EXTRAIT_MAX = 140

function sujetsRef() {
  return collection(db, COLLECTIONS.discussionsSujets)
}

function messagesRef(sujetId: string) {
  return collection(db, COLLECTIONS.discussionsSujets, sujetId, SOUS_COLLECTION_MESSAGES)
}

/** Sujets triés du plus récemment actif au plus ancien, en temps réel. */
export function ecouterSujets(
  onSujets: (sujets: SujetDiscussion[]) => void,
  onErreur: (message: string) => void
): () => void {
  return onSnapshot(
    query(sujetsRef(), orderBy('dernierMessageLe', 'desc')),
    (snap) => onSujets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SujetDiscussion, 'id'>) }))),
    () => onErreur("Impossible de charger les discussions. Vérifiez que vous êtes connecté et que les règles Firestore du module sont déployées.")
  )
}

/** Messages d'un sujet, du plus ancien au plus récent, en temps réel. */
export function ecouterMessages(
  sujetId: string,
  onMessages: (messages: MessageDiscussion[]) => void,
  onErreur: (message: string) => void
): () => void {
  return onSnapshot(
    query(messagesRef(sujetId), orderBy('envoyeLe', 'asc')),
    (snap) => onMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MessageDiscussion, 'id'>) }))),
    () => onErreur('Impossible de charger les messages de ce sujet.')
  )
}

export async function creerSujet(
  input: NouveauSujetInput,
  auteur: { id: string; nom: string }
): Promise<string> {
  const id = crypto.randomUUID()
  const maintenant = new Date().toISOString()
  const sujet: Omit<SujetDiscussion, 'id'> = {
    titre: input.titre.trim(),
    description: input.description.trim(),
    theme: input.theme,
    auteurId: auteur.id,
    auteurNom: auteur.nom,
    creeLe: maintenant,
    cloture: false,
    nombreMessages: 0,
    // Un sujet sans message se trie quand même dans la liste (en tête, comme
    // n'importe quelle activité récente) — d'où la reprise de sa date de
    // création plutôt qu'une chaîne vide, que `orderBy` renverrait en fin.
    dernierMessageLe: maintenant,
    dernierMessageAuteur: auteur.nom,
    dernierMessageExtrait: input.description.trim().slice(0, EXTRAIT_MAX),
  }
  await setDoc(doc(sujetsRef(), id), sujet)
  return id
}

export async function envoyerMessage(
  sujetId: string,
  texte: string,
  auteur: { id: string; nom: string },
  nombreMessagesActuel: number
): Promise<void> {
  const contenu = texte.trim()
  if (!contenu) return
  const envoyeLe = new Date().toISOString()
  const message: Omit<MessageDiscussion, 'id'> = {
    auteurId: auteur.id,
    auteurNom: auteur.nom,
    texte: contenu,
    envoyeLe,
  }
  await setDoc(doc(messagesRef(sujetId), crypto.randomUUID()), message)
  await majApercu(sujetId, nombreMessagesActuel + 1, message)
}

/**
 * Supprime son propre message. `nouveauDernier` est le message qui devient le
 * dernier du fil une fois celui-ci retiré (null si le fil se vide) : l'aperçu
 * dénormalisé du sujet resterait sinon figé sur un message qui n'existe plus.
 */
export async function supprimerMessage(
  sujetId: string,
  messageId: string,
  nombreMessagesRestant: number,
  nouveauDernier: MessageDiscussion | null,
  sujet: SujetDiscussion
): Promise<void> {
  await deleteDoc(doc(messagesRef(sujetId), messageId))
  if (nouveauDernier) {
    await majApercu(sujetId, nombreMessagesRestant, nouveauDernier)
    return
  }
  // Fil vidé : on retombe sur la description du sujet, comme à sa création.
  await updateDoc(doc(sujetsRef(), sujetId), {
    nombreMessages: 0,
    dernierMessageLe: sujet.creeLe,
    dernierMessageAuteur: sujet.auteurNom,
    dernierMessageExtrait: sujet.description.slice(0, EXTRAIT_MAX),
  })
}

type ApercuDernierMessage = Pick<MessageDiscussion, 'envoyeLe' | 'auteurNom' | 'texte'>

function majApercu(sujetId: string, nombreMessages: number, dernier: ApercuDernierMessage) {
  return updateDoc(doc(sujetsRef(), sujetId), {
    nombreMessages,
    dernierMessageLe: dernier.envoyeLe,
    dernierMessageAuteur: dernier.auteurNom,
    dernierMessageExtrait: dernier.texte.slice(0, EXTRAIT_MAX),
  })
}

export function basculerCloture(sujetId: string, cloture: boolean): Promise<void> {
  return updateDoc(doc(sujetsRef(), sujetId), { cloture })
}

/** Suppression d'un sujet entier — admins uniquement (cf. firestore.rules). */
export async function supprimerSujet(sujetId: string, messages: MessageDiscussion[]): Promise<void> {
  // Firestore ne supprime pas les sous-collections avec leur parent : sans
  // ce nettoyage, les messages resteraient orphelins et facturés.
  await Promise.all(messages.map((m) => deleteDoc(doc(messagesRef(sujetId), m.id))))
  await deleteDoc(doc(sujetsRef(), sujetId))
}

export function ecouterLectures(uid: string, onLectures: (parSujet: Record<string, string>) => void): () => void {
  return onSnapshot(
    doc(db, COLLECTIONS.discussionsLectures, uid),
    (snap) => onLectures((snap.data()?.sujets as Record<string, string> | undefined) ?? {}),
    // Contrairement aux sujets et aux messages, dont l'erreur est affichée
    // dans la page, l'échec du suivi de lecture ne dégrade qu'un détail : les
    // pastilles « non lu ». Il était donc avalé — mais un document qui
    // n'existe pas encore ne produit pas d'erreur ici (l'instantané arrive
    // vide), si bien qu'une erreur signale toujours un vrai refus d'accès.
    // Signalé au bandeau, sans bloquer le fil.
    (erreur) => {
      signalerIncident('chargement', 'Le suivi des discussions lues', erreur)
      onLectures({})
    }
  )
}

export function marquerLu(uid: string, sujetId: string, date: string): Promise<void> {
  return setDoc(doc(db, COLLECTIONS.discussionsLectures, uid), { sujets: { [sujetId]: date } }, { merge: true })
}
