import { createContext } from 'react'
import type { EntreeListe } from '../types/listeValeur'

export interface ListesValeursContextValue {
  /** Entrées ajoutées par un administrateur (actives + inactives), par identifiant de liste. */
  ajouts: Record<string, EntreeListe[]>
  chargement: boolean
  /**
   * Valeurs **actives** ajoutées pour cette liste — à fusionner avec celles
   * déjà présentes dans les données (`valeursDistinctes`). Rend un tableau
   * vide pour une liste jamais alimentée ou entièrement désactivée.
   */
  valeursDe: (idListe: string) => string[]
  /** Entrées actives + inactives, pour l'écran d'administration (Paramètres). */
  entreesDe: (idListe: string) => EntreeListe[]
  ajouterValeur: (idListe: string, valeur: string) => Promise<void>
  retirerValeur: (idListe: string, valeur: string) => Promise<void>
  /** MET-59 : renomme une entrée en place. Sans effet si la nouvelle valeur est vide ou en collision. */
  renommerValeur: (idListe: string, ancienneValeur: string, nouvelleValeur: string) => Promise<void>
  /** MET-60 : bascule l'état actif/inactif d'une entrée. */
  basculerActivation: (idListe: string, valeur: string) => Promise<void>
}

export const ListesValeursContext = createContext<ListesValeursContextValue | undefined>(undefined)
