import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Point d'accès unique au SDK Firebase web (Auth + Firestore) — le front
// parle directement à Firestore depuis le 22/07/2026 (plus de couche API
// NestJS intermédiaire, cf. CLAUDE.md).
//
// Le projet réel derrière `firebaseConfig` dépend de la branche (04/09/2026,
// « distinguer les instances ») : `.env.local` (non suivi, `*.local`) porte
// `driver-6ae2b` — l'instance pré-prod de la branche `main`, partagée avec
// les apps "driver" — tandis que `.env.production` (suivi par git, valeurs
// non sensibles côté web) porte `webicp` sur la branche `prod` — instance
// **dédiée** à cette application, base Firestore volontairement vide,
// seules les règles et les comptes créés depuis l'écran Agents y vivent.
// `npm run dev` lit `.env.local` (driver-6ae2b), `npm run build`/`npm run
// prod` (mode "production" de Vite, chargé après `.env.local`) lisent
// `.env.production` : le bundle déployé sur Hosting cible donc toujours
// l'instance de la branche courante, sans configuration supplémentaire.
//
// Pas de Storage : il exige le plan payant Blaze sur `driver-6ae2b`. Les
// pièces jointes sont stockées en base 64 dans Firestore depuis le
// 14/08/2026 (lib/piecesJointes.ts) — valable pour les deux instances.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

// Crée un compte Firebase Auth pour un tiers (création d'utilisateur par un
// admin, cf. AgentsPage) sans déconnecter la session en cours :
// createUserWithEmailAndPassword connecte automatiquement le SDK avec le
// compte qu'il vient de créer — s'il était appelé sur `auth` (l'instance
// utilisée par le reste de l'app), l'admin se retrouverait déconnecté et
// remplacé par le compte tout juste créé. On isole donc l'opération sur une
// instance Firebase secondaire jetable, détruite juste après : aucun effet
// sur `auth`/`db`. Pas de backend/Admin SDK dans cet environnement (cf.
// CLAUDE.md) — ce contournement 100% client est la seule option.
// Mot de passe : aléatoire, jamais affiché ni transmis — l'email de
// définition de mot de passe envoyé juste après est le seul moyen pour le
// nouvel utilisateur de se connecter.
export async function creerCompteAuth(email: string): Promise<string> {
  const secondaire = initializeApp(firebaseConfig, `creation-utilisateur-${Date.now()}`)
  try {
    const authSecondaire = getAuth(secondaire)
    const motDePasseAleatoire = crypto.randomUUID()
    const credential = await createUserWithEmailAndPassword(authSecondaire, email, motDePasseAleatoire)
    await sendPasswordResetEmail(authSecondaire, email)
    return credential.user.uid
  } finally {
    await deleteApp(secondaire)
  }
}
