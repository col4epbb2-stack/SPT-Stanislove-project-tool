import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS } from '../lib/firestoreCollections'
import type { ProjetFeuilleDeRoute, ProjetFeuilleDeRouteInput } from '../types/feuilleDeRoute'
import { EMPTY_PROJET_FEUILLE_DE_ROUTE } from '../types/feuilleDeRoute'
import type { LigneNavette } from '../types/navette'
import type { Projet } from '../types/project'
import { champsFdrDepuisNavette, libelleComparable, otpFeuilleDeRoute } from '../lib/rapprochementPortefeuille'
import { surveillerChargement } from '../lib/incidents'
import { FeuilleDeRouteContext } from './feuille-de-route-context'

// Identifiant d'une nouvelle ligne : l'horodatage, et non `max(id) + 1`.
// Le compteur se calculait sur l'état local, si bien que deux rattachements
// enchaînés — ou deux utilisateurs simultanés — produisaient le même id, donc
// le même document Firestore : le second écrasait le premier, sans erreur.
// Les 84 lignes importées portent de petits entiers, aucune collision
// possible avec un horodatage.
function prochainIdFdr(): number {
  return Date.now()
}

// Chargée directement depuis Firestore (collection feuille_de_route, 84
// lignes, 22/07/2026 — plus de couche API intermédiaire) plutôt que le mock
// local. add/update/remove (formulaire manuel de la page) persistent
// désormais réellement (audit CDS, 26/07/2026 — même mise à jour que
// ProjectsContext) : état local mis à jour immédiatement, écriture
// Firestore en fire-and-forget (comme ProjectsContext.updateProject), pas
// besoin d'attendre le round-trip réseau pour que l'UI reflète le
// changement.
export function FeuilleDeRouteProvider({ children }: { children: ReactNode }) {
  const [projets, setProjets] = useState<ProjetFeuilleDeRoute[]>([])

  useEffect(() => {
    surveillerChargement('La feuille de route', getDocs(collection(db, COLLECTIONS.feuilleDeRoute)), null).then(
      (snap) => {
        if (snap) setProjets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as ProjetFeuilleDeRoute))
      }
    )
  }, [])

  const addProjet = (input: ProjetFeuilleDeRouteInput): ProjetFeuilleDeRoute => {
    const nextId = prochainIdFdr()
    const projet: ProjetFeuilleDeRoute = { ...input, id: nextId }
    setProjets((prev) => [projet, ...prev])
    setDoc(doc(db, COLLECTIONS.feuilleDeRoute, String(nextId)), projet).catch((e) =>
      console.error('Échec de création de la ligne feuille de route', e)
    )
    return projet
  }

  const updateProjet = (id: number, input: ProjetFeuilleDeRouteInput) => {
    const projet: ProjetFeuilleDeRoute = { ...input, id }
    setProjets((prev) => prev.map((p) => (p.id === id ? projet : p)))
    setDoc(doc(db, COLLECTIONS.feuilleDeRoute, String(id)), projet).catch((e) =>
      console.error('Échec de mise à jour de la ligne feuille de route', e)
    )
  }

  const removeProjet = (id: number) => {
    setProjets((prev) => prev.filter((p) => p.id !== id))
    deleteDoc(doc(db, COLLECTIONS.feuilleDeRoute, String(id))).catch((e) =>
      console.error('Échec de suppression de la ligne feuille de route', e)
    )
  }

  // Retrouve une ligne feuille_de_route existante avant d'en créer une : le
  // lien explicite d'abord, puis le code OTP (clé naturelle déjà lue par
  // `clesFeuilleDeRoute` côté moteur de liaison), puis l'intitulé.
  //
  // Les deux derniers critères ont été ajoutés le 23/08/2026 : la comparaison
  // se faisait sur l'égalité brute des chaînes d'OTP, si bien qu'une ligne
  // dont l'imputation ne différait que par la casse ou une espace — ou qui
  // n'en portait pas du tout — était **dupliquée** au lieu d'être mise à jour.
  const synchroniserDepuisNavette = async (ligne: LigneNavette, projet: Projet) => {
    const champs = champsFdrDepuisNavette(ligne, projet)
    const otpNavette = otpFeuilleDeRoute({ compteImputation: ligne.codeOTP, otp: null } as ProjetFeuilleDeRoute)
    const libelleNavette = libelleComparable(ligne.libelle)
    const existant =
      projets.find((p) => p.ligneNavetteId === ligne.id) ??
      projets.find((p) => otpNavette !== null && otpFeuilleDeRoute(p) === otpNavette) ??
      projets.find((p) => p.projetId === projet.id) ??
      projets.find((p) => libelleNavette !== null && libelleComparable(p.projet) === libelleNavette)

    if (existant) {
      await updateDoc(doc(db, COLLECTIONS.feuilleDeRoute, String(existant.id)), champs)
      setProjets((prev) => prev.map((p) => (p.id === existant.id ? { ...p, ...champs } : p)))
      return
    }

    const nextId = prochainIdFdr()
    const nouveau: ProjetFeuilleDeRoute = { ...EMPTY_PROJET_FEUILLE_DE_ROUTE, ...champs, id: nextId }
    await setDoc(doc(db, COLLECTIONS.feuilleDeRoute, String(nextId)), nouveau)
    setProjets((prev) => [nouveau, ...prev])
  }

  // Après un rapprochement en lot (RapprochementPortefeuille) : la feuille de
  // route garde ses lignes en mémoire depuis son chargement, et le lot écrit
  // dans la collection sans passer par ce contexte — sans cette relecture,
  // l'écran continuerait d'afficher les lignes non liées jusqu'au
  // rechargement de la page (même raison que `NavetteContext.rechargerLignes`).
  const remplacerProjets = (lignes: ProjetFeuilleDeRoute[]) => setProjets(lignes)

  return (
    <FeuilleDeRouteContext.Provider
      value={{ projets, addProjet, updateProjet, removeProjet, synchroniserDepuisNavette, remplacerProjets }}
    >
      {children}
    </FeuilleDeRouteContext.Provider>
  )
}
