import { createContext } from 'react'
import type {
  AjouterAvcInput,
  ContratListe,
  CreerContratInput,
  ModifierContratInput,
  AjouterConsommationInput,
  Fournisseur,
} from '../lib/contratsEngine'

export interface ContratsContextValue {
  contrats: ContratListe[]
  fournisseurs: Fournisseur[]
  chargement: boolean
  rafraichir: () => Promise<void>
  creerContrat: (input: CreerContratInput) => Promise<{ id: string }>
  modifierContrat: (contratId: string, input: ModifierContratInput) => Promise<void>
  // Suppression définitive (04/09/2026, demande explicite). L'AVC reste
  // indélébile (cf. contratsEngine.supprimerContrat) et les commandes liées ne
  // sont pas supprimées avec le contrat, seulement détachées.
  supprimerContrat: (contratId: string) => Promise<void>
  // Augmentation de valeur cible (doc/module contrat.docx §2). `saisiPar` est
  // renseigné par le contexte depuis la session, pas par l'appelant.
  ajouterAvcContrat: (contratId: string, input: Omit<AjouterAvcInput, 'saisiPar'>) => Promise<void>
  ajouterConsommationContrat: (contratId: string, input: AjouterConsommationInput) => Promise<void>
  lierProjet: (contratId: string, projetId: string) => Promise<void>
  delierProjet: (contratId: string, projetId: string) => Promise<void>
  exercerOptionRenouvellement: (contratId: string, optionId: string) => Promise<void>
}

export const ContratsContext = createContext<ContratsContextValue | undefined>(undefined)
