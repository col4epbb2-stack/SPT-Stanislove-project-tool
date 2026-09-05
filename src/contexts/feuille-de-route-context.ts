import { createContext } from 'react'
import type { ProjetFeuilleDeRoute, ProjetFeuilleDeRouteInput } from '../types/feuilleDeRoute'
import type { LigneNavette } from '../types/navette'
import type { Projet } from '../types/project'

export interface FeuilleDeRouteContextValue {
  projets: ProjetFeuilleDeRoute[]
  addProjet: (input: ProjetFeuilleDeRouteInput) => ProjetFeuilleDeRoute
  updateProjet: (id: number, input: ProjetFeuilleDeRouteInput) => void
  removeProjet: (id: number) => void
  // Écriture Firestore réelle et ciblée (contrairement aux 3 fonctions
  // ci-dessus, restées locales) — déclenchée quand une ligne navette est
  // liée à une fiche projet, cf. types/feuilleDeRoute.ts.
  synchroniserDepuisNavette: (ligne: LigneNavette, projet: Projet) => Promise<void>
  // Remplace l'état local après une écriture en lot faite hors du contexte
  // (rapprochement du portefeuille, cf. lib/rapprochementPortefeuille.ts).
  remplacerProjets: (lignes: ProjetFeuilleDeRoute[]) => void
}

export const FeuilleDeRouteContext = createContext<FeuilleDeRouteContextValue | undefined>(undefined)
