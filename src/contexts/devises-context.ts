import { createContext } from 'react'
import type { CodeDevise, Devise } from '../types/devise'

export interface DevisesContextValue {
  /** Référentiel effectif : celui de la base, ou les valeurs par défaut tant qu'il est vierge. */
  devises: Devise[]
  /** Devise de référence de l'application (taux = 1). Toujours définie. */
  pivot: Devise
  chargement: boolean
  /**
   * Aucune devise n'a encore été enregistrée : l'écran affiche les valeurs
   * par défaut et le dit, plutôt que de faire passer un défaut pour une
   * décision d'administrateur.
   */
  referentielVierge: boolean
  enregistrerDevise: (devise: Devise, codeInitial?: string) => Promise<void>
  supprimerDevise: (code: CodeDevise) => Promise<void>
  definirTaux: (code: CodeDevise, taux: number | null) => Promise<void>
  definirPivot: (code: CodeDevise) => Promise<void>
  /** Écrit les devises par défaut en base — proposé à l'admin sur un référentiel vierge. */
  initialiserReferentiel: () => Promise<void>
}

export const DevisesContext = createContext<DevisesContextValue | undefined>(undefined)
