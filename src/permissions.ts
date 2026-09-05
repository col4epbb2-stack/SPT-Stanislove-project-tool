import type { UserRole } from '../types/user'
import type { DashboardPage } from '../types/navigation'

const COMMON_PAGES: DashboardPage[] = [
  'navette',
  'feuille-de-route',
  'hse',
  'tableau-de-bord',
  'projets',
  'tonnage-echaf',
  'travaux-metal',
  'procurement-suivi',
  'suivi-hebdo-crj',
  'contrat-peinture',
  'contrats',
  // Contrat EPCM : ouvert à tous les rôles applicatifs — c'est le profil EPCM
  // de l'utilisateur (types/contratEpcm.ts, §13) qui décide ce qu'il peut y
  // faire, pas le rôle global.
  'contrat-epcm',
  'grand-arret',
  'lut',
  // Discussions : ouvert à tous les rôles — c'est un espace d'échange, pas
  // un module de gestion (la modération d'un sujet reste, elle, réservée à
  // son auteur et aux admins, cf. firestore.rules).
  'discussions',
  // Devises : consultable par tous — savoir à quel taux un montant a été
  // converti fait partie de la lecture d'un budget. Seul un admin peut
  // modifier le référentiel (contrôlé dans la page, comme la cale navette).
  'devises',
  'parametres',
]

export const ROLE_PERMISSIONS: Record<UserRole, DashboardPage[]> = {
  admin: ['agents', 'rapprochement', ...COMMON_PAGES],
  agent: [...COMMON_PAGES],
  controleur: [...COMMON_PAGES],
}

export function canAccess(role: UserRole, page: DashboardPage): boolean {
  return ROLE_PERMISSIONS[role].includes(page)
}
