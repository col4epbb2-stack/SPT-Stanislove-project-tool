import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { auth, creerCompteAuth, db } from '../lib/firebase'
import { COLLECTIONS, type UtilisateurDoc } from '../lib/firestoreCollections'
import { getInitials } from '../lib/userHelpers'
import { AVATAR_COLORS } from '../lib/avatarColors'
import type { DirectoryUser, ProfilTonnage, ProfilValidationNavette } from '../types/user'
import { AuthContext, type ModificationUtilisateurInput, type NouvelUtilisateurInput } from './auth-context'

function versDirectoryUser(id: string, u: UtilisateurDoc, index: number): DirectoryUser {
  return {
    id,
    name: u.nom,
    email: u.email,
    password: '',
    role: u.role,
    profilNavette: u.profilNavette,
    profilTonnage: u.profilTonnage,
    fonction: u.fonction ?? '',
    initials: getInitials(u.nom),
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length].key,
    active: true,
  }
}

// Authentification Firebase réelle (Auth) + annuaire lu directement dans
// Firestore (collection `utilisateurs`, doc ID = uid). Le rôle admin/agent
// vivait auparavant en custom claim posé par l'API NestJS (Admin SDK) ;
// l'API étant abandonnée le 22/07/2026 (plus de backend pour poser des
// claims), le champ `utilisateurs/{uid}.role` — déjà présent dans Firestore,
// déjà lu en parallèle par l'ex-API pour la fiche affichée — devient la
// source d'autorité unique, cohérente avec les règles de sécurité Firestore
// qui lisent ce même document.
// ⚠️ TEMPORAIRE (05/09/2026) — aperçu de l'interface sans serveur Firebase.
// Activé uniquement si VITE_AUTH_STUB est défini (.env.local, non suivi par
// git) : inerte dans tout build normal, et absent de .env.production. À
// retirer avec le .env.local temporaire.
const STUB_AUTH = Boolean(import.meta.env.VITE_AUTH_STUB)

const UTILISATEUR_STUB: DirectoryUser = {
  id: "stub-admin",
  name: "Aperçu local",
  email: "apercu@local",
  password: "",
  role: "admin",
  fonction: "Aperçu de l'interface (hors ligne)",
  initials: "AL",
  avatarColor: AVATAR_COLORS[0].key,
  active: true,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [currentUser, setCurrentUser] = useState<DirectoryUser | null>(STUB_AUTH ? UTILISATEUR_STUB : null)
  const [chargement, setChargement] = useState(!STUB_AUTH)

  useEffect(() => {
    getDocs(collection(db, COLLECTIONS.utilisateurs))
      .then((snap) => setUsers(snap.docs.map((d, i) => versDirectoryUser(d.id, d.data() as UtilisateurDoc, i))))
      .catch(() => setUsers([]))
  }, [])

  useEffect(() => {
    if (STUB_AUTH) return
    // Restaure la session au rechargement (Firebase persiste le jeton).
    const desabonner = onAuthStateChanged(auth, async (compte) => {
      if (!compte) {
        setCurrentUser(null)
        setChargement(false)
        return
      }
      try {
        const profil = await getDoc(doc(db, COLLECTIONS.utilisateurs, compte.uid))
        if (!profil.exists()) throw new Error('Profil introuvable')
        setCurrentUser(versDirectoryUser(compte.uid, profil.data() as UtilisateurDoc, 0))
      } catch {
        setCurrentUser(null)
      }
      setChargement(false)
    })
    return desabonner
  }, [])

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      return true
    } catch {
      return false
    }
  }

  const logout = () => signOut(auth)

  const creerUtilisateur = async (input: NouvelUtilisateurInput) => {
    const uid = await creerCompteAuth(input.email)
    const docData: UtilisateurDoc = { nom: input.nom, email: input.email, role: input.role, fonction: input.fonction }
    if (input.profilNavette) docData.profilNavette = input.profilNavette
    await setDoc(doc(db, COLLECTIONS.utilisateurs, uid), docData)
    setUsers((prev) => [...prev, versDirectoryUser(uid, docData, prev.length)])
  }

  // Désignation du chef de département / directeur technique qui visent les
  // révisions navette (admin only, cf. firestore.rules). `null` retire la
  // désignation — deleteField() et non `undefined`, que Firestore rejette.
  const definirProfilNavette = async (userId: string, profil: ProfilValidationNavette | null) => {
    await updateDoc(doc(db, COLLECTIONS.utilisateurs, userId), {
      profilNavette: profil ?? deleteField(),
    })
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, profilNavette: profil ?? undefined } : u)))
    setCurrentUser((prev) => (prev && prev.id === userId ? { ...prev, profilNavette: profil ?? undefined } : prev))
  }

  // Désignation du Responsable Technique / superviseur / gestionnaire du
  // contrat qui approuvent/commentent les rapports Tonnage échafaudage
  // (03/09/2026, lot 7) — même mécanique que definirProfilNavette ci-dessus.
  const definirProfilTonnage = async (userId: string, profil: ProfilTonnage | null) => {
    await updateDoc(doc(db, COLLECTIONS.utilisateurs, userId), {
      profilTonnage: profil ?? deleteField(),
    })
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, profilTonnage: profil ?? undefined } : u)))
    setCurrentUser((prev) => (prev && prev.id === userId ? { ...prev, profilTonnage: profil ?? undefined } : prev))
  }

  // Modification de la fiche d'annuaire. L'email est volontairement absent
  // de l'input : il identifie le compte Firebase Auth, que seul l'Admin SDK
  // pourrait renommer (cf. auth-context.ts).
  const modifierUtilisateur = async (userId: string, input: ModificationUtilisateurInput) => {
    await updateDoc(doc(db, COLLECTIONS.utilisateurs, userId), {
      nom: input.nom,
      fonction: input.fonction,
      role: input.role,
      // `null` retire la désignation : deleteField() et non `undefined`, que
      // Firestore rejette (même contrainte que definirProfilNavette).
      profilNavette: input.profilNavette ?? deleteField(),
    })
    const appliquer = (u: DirectoryUser): DirectoryUser => ({
      ...u,
      name: input.nom,
      initials: getInitials(input.nom),
      fonction: input.fonction,
      role: input.role,
      profilNavette: input.profilNavette ?? undefined,
    })
    setUsers((prev) => prev.map((u) => (u.id === userId ? appliquer(u) : u)))
    // Un admin qui se rétrograde lui-même doit le voir immédiatement : sans
    // cette ligne, l'interface continuerait de lui montrer ses droits
    // d'avant jusqu'au rechargement, alors que les règles Firestore, elles,
    // appliqueraient déjà le nouveau rôle.
    setCurrentUser((prev) => (prev && prev.id === userId ? appliquer(prev) : prev))
  }

  // Retrait de l'annuaire : coupe l'accès à l'application, sans supprimer le
  // compte Firebase Auth (impossible côté client pour un tiers). Le refus de
  // se supprimer soi-même n'est pas une précaution de confort : un admin qui
  // efface sa propre fiche perd l'accès à l'écran qui permettrait de la
  // recréer, et son adresse reste prise côté Auth.
  const supprimerUtilisateur = async (userId: string) => {
    if (currentUser?.id === userId) {
      throw new Error('Vous ne pouvez pas supprimer votre propre compte : vous perdriez l’accès à cet écran.')
    }
    await deleteDoc(doc(db, COLLECTIONS.utilisateurs, userId))
    setUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        login,
        logout,
        chargement,
        creerUtilisateur,
        definirProfilNavette,
        definirProfilTonnage,
        modifierUtilisateur,
        supprimerUtilisateur,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
