import { useSyncExternalStore } from 'react'

// Signalement des échecs Firestore (13/08/2026).
//
// Jusqu'ici, une lecture qui échoue laissait l'état à sa valeur initiale — un
// tableau vide — et une écriture qui échoue partait dans `console.error`.
// Les deux produisaient exactement l'écran d'une base vide : une règle de
// sécurité manquante, une coupure réseau ou un compte sans droits étaient
// indiscernables d'un « il n'y a rien à afficher ». C'est le pire mode de
// défaillance pour un outil de pilotage, parce qu'il ne se signale pas.
//
// Un magasin de module plutôt qu'un contexte de plus : les échecs se
// produisent dans `data/*.ts` et dans les providers eux-mêmes, c'est-à-dire
// hors de tout composant. Un magasin s'importe depuis n'importe quelle
// couche, sans provider à ajouter autour de l'application ni prop à faire
// descendre.

export type TypeIncident = 'chargement' | 'ecriture'

export interface Incident {
  id: string
  type: TypeIncident
  /** Ce qui a échoué, en mots de l'utilisateur : « Fiches projet », « Navette ». */
  quoi: string
  /** Message d'origine, pour le détail dépliable. */
  detail: string
  date: string
}

let incidents: Incident[] = []
const abonnes = new Set<() => void>()

function notifier() {
  for (const abonne of abonnes) abonne()
}

function messageDe(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message
  return String(erreur)
}

/**
 * Enregistre un échec. La clé est `{type}:{quoi}` : un même chargement qui
 * échoue à chaque tentative ne doit pas empiler dix bandeaux identiques, il
 * met à jour le sien.
 */
export function signalerIncident(type: TypeIncident, quoi: string, erreur: unknown): void {
  const id = `${type}:${quoi}`
  const incident: Incident = { id, type, quoi, detail: messageDe(erreur), date: new Date().toISOString() }
  incidents = [...incidents.filter((i) => i.id !== id), incident]
  notifier()
  // La console reste alimentée : le bandeau dit qu'il y a un problème, la
  // trace complète est ce qui permet de le corriger.
  console.error(`[${type}] ${quoi}`, erreur)
}

export function oublierIncident(id: string): void {
  incidents = incidents.filter((i) => i.id !== id)
  notifier()
}

export function oublierTousLesIncidents(): void {
  incidents = []
  notifier()
}

/**
 * Enrobe une promesse de chargement : en cas d'échec, l'incident est signalé
 * et la valeur de repli est renvoyée, pour que l'appelant garde son état
 * cohérent (un tableau vide reste un tableau vide — mais cette fois l'écran
 * le dit).
 */
export function surveillerChargement<T>(quoi: string, promesse: Promise<T>, repli: T): Promise<T> {
  return promesse.catch((erreur) => {
    signalerIncident('chargement', quoi, erreur)
    return repli
  })
}

/** Même principe pour une écriture, qui n'a pas de valeur de repli. */
export function surveillerEcriture(quoi: string, promesse: Promise<unknown>): Promise<void> {
  return promesse.then(
    () => undefined,
    (erreur) => {
      signalerIncident('ecriture', quoi, erreur)
    }
  )
}

function souscrire(abonne: () => void): () => void {
  abonnes.add(abonne)
  return () => {
    abonnes.delete(abonne)
  }
}

function lire(): Incident[] {
  return incidents
}

export function useIncidents(): Incident[] {
  return useSyncExternalStore(souscrire, lire, lire)
}
