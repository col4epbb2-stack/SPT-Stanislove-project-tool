import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ajouterAvcContrat as ajouterAvcContratEngine,
  ajouterConsommationContrat as ajouterConsommationContratEngine,
  chargerFournisseurs,
  creerContrat as creerContratEngine,
  delierProjet as delierProjetEngine,
  exercerOptionRenouvellement as exercerOptionRenouvellementEngine,
  lierProjet as lierProjetEngine,
  listerContrats,
  modifierContrat as modifierContratEngine,
  supprimerContrat as supprimerContratEngine,
} from '../lib/contratsEngine'
import type {
  AjouterAvcInput,
  AjouterConsommationInput,
  ContratListe,
  CreerContratInput,
  Fournisseur,
  ModifierContratInput,
} from '../lib/contratsEngine'
import { surveillerChargement } from '../lib/incidents'
import { ContratsContext } from './contrats-context'
import { useAuth } from './useAuth'

// Référentiel portfolio des contrats (`contratsEngine.ts`), branché sur
// Firestore directement — même pattern que ProjectsContext/NavetteContext.
// Mis en commun ici pour être partagé entre ContratsPage (vue portfolio) et
// l'onglet Contrats de la fiche projet, qui lisent désormais la même source
// de vérité (fusion des deux systèmes de contrats, retour utilisateur).
export function ContratsProvider({ children }: { children: ReactNode }) {
  // Signature des AVC : un historique dit qui l'a écrit (AuthProvider enveloppe
  // déjà ce provider dans App.tsx).
  const { currentUser } = useAuth()
  const [contrats, setContrats] = useState<ContratListe[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [chargement, setChargement] = useState(true)

  const rafraichir = async () => {
    setContrats(await listerContrats())
  }

  useEffect(() => {
    surveillerChargement('Les contrats et leurs fournisseurs', Promise.all([listerContrats(), chargerFournisseurs()]), null)
      .then((resultat) => {
        if (!resultat) return
        const [c, f] = resultat
        setContrats(c)
        setFournisseurs(f)
      })
      .finally(() => setChargement(false))
  }, [])

  const creerContrat = async (input: CreerContratInput) => {
    const contrat = await creerContratEngine(input)
    await rafraichir()
    return contrat
  }

  // `await` avant le rafraîchissement, comme les autres écritures : un refus
  // des règles doit remonter à l'écran plutôt que d'y laisser une valeur
  // jamais enregistrée.
  const modifierContrat = async (contratId: string, input: ModifierContratInput) => {
    await modifierContratEngine(contratId, input)
    await rafraichir()
  }

  const supprimerContrat = async (contratId: string) => {
    await supprimerContratEngine(contratId)
    await rafraichir()
  }

  const ajouterAvcContrat = async (contratId: string, input: Omit<AjouterAvcInput, 'saisiPar'>) => {
    await ajouterAvcContratEngine(contratId, { ...input, saisiPar: currentUser?.name })
    await rafraichir()
  }

  const ajouterConsommationContrat = async (contratId: string, input: AjouterConsommationInput) => {
    await ajouterConsommationContratEngine(contratId, input)
    await rafraichir()
  }

  const lierProjet = async (contratId: string, projetId: string) => {
    await lierProjetEngine(contratId, projetId)
    await rafraichir()
  }

  const delierProjet = async (contratId: string, projetId: string) => {
    await delierProjetEngine(contratId, projetId)
    await rafraichir()
  }

  const exercerOptionRenouvellement = async (contratId: string, optionId: string) => {
    await exercerOptionRenouvellementEngine(contratId, optionId)
    await rafraichir()
  }

  return (
    <ContratsContext.Provider
      value={{
        contrats,
        fournisseurs,
        chargement,
        rafraichir,
        creerContrat,
        modifierContrat,
        supprimerContrat,
        ajouterAvcContrat,
        ajouterConsommationContrat,
        lierProjet,
        delierProjet,
        exercerOptionRenouvellement,
      }}
    >
      {children}
    </ContratsContext.Provider>
  )
}
