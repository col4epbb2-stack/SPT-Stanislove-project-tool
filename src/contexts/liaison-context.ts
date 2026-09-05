import { createContext } from 'react'
import type { LiaisonManuelle, ModuleLiaison } from '../types/liaison'
import type { AliasProjet } from '../types/referentiels'

export interface LiaisonContextValue {
  // Registre des confirmations manuelles {module, clé} → projetId — persisté
  // côté API (Firestore) depuis la Phase 1.
  liaisons: LiaisonManuelle[]
  // Table d'alias nom libre → projet, commune à tous les modules.
  aliases: AliasProjet[]
  confirmerLiaison: (
    module: ModuleLiaison,
    cleType: LiaisonManuelle['cleType'],
    cleValeur: string,
    projetId: string
  ) => Promise<void>
  supprimerLiaison: (id: string) => Promise<void>
}

export const LiaisonContext = createContext<LiaisonContextValue | undefined>(undefined)
