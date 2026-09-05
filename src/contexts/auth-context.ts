import { createContext } from 'react'
import type { DirectoryUser, ProfilTonnage, ProfilValidationNavette, UserRole } from '../types/user'

export interface NouvelUtilisateurInput {
  nom: string
  email: string
  role: UserRole
  fonction: string
  profilNavette?: ProfilValidationNavette
}

/** Champs modifiables d'un compte existant — l'email ne l'est pas (voir plus bas). */
export interface ModificationUtilisateurInput {
  nom: string
  fonction: string
  role: UserRole
  profilNavette?: ProfilValidationNavette | null
}

export interface AuthContextValue {
  currentUser: DirectoryUser | null
  users: DirectoryUser[]
  // Authentification Firebase réelle : résultat connu de façon asynchrone
  // (contrairement au mock précédent, synchrone).
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  // Session Firebase en cours de restauration (onAuthStateChanged initial) —
  // évite un flash sur la page de connexion au rechargement.
  chargement: boolean
  // Création d'un compte pour un tiers (admin only, cf. firestore.rules) —
  // crée le compte Firebase Auth ET le doc utilisateurs/{uid} associé.
  creerUtilisateur: (input: NouvelUtilisateurInput) => Promise<void>
  // Désigne (ou retire) le profil qui vise les révisions navette — admin
  // only, cf. firestore.rules sur `utilisateurs`.
  definirProfilNavette: (userId: string, profil: ProfilValidationNavette | null) => Promise<void>
  // Désigne (ou retire) le profil du workflow d'approbation Tonnage
  // échafaudage (03/09/2026, lot 7) — même régime que ci-dessus.
  definirProfilTonnage: (userId: string, profil: ProfilTonnage | null) => Promise<void>
  /**
   * Modifie la fiche d'annuaire d'un compte (20/08/2026).
   *
   * **L'email n'en fait pas partie** : il identifie le compte Firebase Auth,
   * et le changer côté Auth pour quelqu'un d'autre demande l'Admin SDK, dont
   * ce projet ne dispose pas (pas de backend, cf. CLAUDE.md). Le modifier
   * dans le seul document Firestore ferait diverger l'annuaire de l'identité
   * réelle : la personne continuerait de se connecter avec l'ancienne
   * adresse pendant que l'écran en afficherait une autre.
   */
  modifierUtilisateur: (userId: string, input: ModificationUtilisateurInput) => Promise<void>
  /**
   * Retire un compte de l'annuaire (admin only).
   *
   * Ce que ça fait vraiment : supprime `utilisateurs/{uid}`, ce qui **coupe
   * l'accès à l'application** (AuthContext refuse une session sans fiche
   * d'annuaire). Ce que ça ne fait pas : supprimer le compte Firebase Auth,
   * impossible côté client pour un tiers — l'adresse reste donc prise, et un
   * compte recréé avec le même email échouera. L'écran le dit avant de
   * demander confirmation.
   */
  supprimerUtilisateur: (userId: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
