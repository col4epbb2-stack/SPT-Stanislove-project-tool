import {
  ClipboardList,
  Factory,
  FileText,
  FolderKanban,
  HeartPulse,
  Layers3,
  LayoutDashboard,
  Link2,
  MessagesSquare,
  Milestone,
  PackageSearch,
  PaintBucket,
  Route,
  Settings,
  Coins,
  ShieldAlert,
  UserSquare2,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { DashboardPage } from '../types/navigation'

// Description du menu, sortie de DashboardLayout pour être partagée avec la
// palette de commandes (un module qui exporte des composants ET des données
// casse le rafraîchissement à chaud de Vite, cf. components/ui/tonsKpi.ts).
//
// Les 18 entrées étaient une liste plate : au-delà d'une dizaine, on ne
// cherche plus par balayage mais par mémoire de position, et toute nouvelle
// entrée déplace les suivantes. Elles sont donc regroupées par métier, dans
// l'ordre du cycle de vie d'un projet (piloter → produire → acheter →
// échanger → administrer).

export interface EntreeMenu {
  icon: LucideIcon
  label: string
  path: DashboardPage
  // Texte affiché sous le titre dans la barre supérieure et dans la palette
  // de commandes : dit ce que la page contient, là où le seul libellé du
  // menu est souvent trop court pour lever l'ambiguïté (« Contrats » vs
  // « Contrat EPCM » vs « Contrat peinture »).
  description: string
  // Termes supplémentaires reconnus par la recherche de la palette — les
  // noms d'usage ne sont pas toujours ceux du menu.
  motsCles?: string[]
}

export interface GroupeMenu {
  titre: string
  entrees: EntreeMenu[]
}

export const GROUPES_MENU: GroupeMenu[] = [
  {
    titre: 'Pilotage',
    entrees: [
      {
        icon: LayoutDashboard,
        label: 'Tableau de bord',
        path: 'tableau-de-bord',
        description: 'Vue consolidée du portefeuille',
        motsCles: ['kpi', 'accueil', 'synthèse'],
      },
      {
        icon: Route,
        label: 'Navette',
        path: 'navette',
        description: 'Budgets, cycles PDC et révisions',
        motsCles: ['budget', 'pdc', 'arbitrage', 'cale', 'otp'],
      },
      {
        icon: Milestone,
        label: 'Feuille de route',
        path: 'feuille-de-route',
        description: 'Projets planifiés et engagements',
        motsCles: ['fdr', 'planning', 'engagement'],
      },
      {
        icon: FolderKanban,
        label: 'Projets',
        path: 'projets',
        description: 'Fiches projet et suivi détaillé',
        motsCles: ['fiche', 'affaire'],
      },
      { icon: HeartPulse, label: 'HSE', path: 'hse', description: 'Sécurité, incidents et actions', motsCles: ['sécurité', 'accident'] },
    ],
  },
  {
    titre: 'Terrain & production',
    entrees: [
      {
        icon: ClipboardList,
        label: 'Suivi hebdo CRJ',
        path: 'suivi-hebdo-crj',
        description: 'Rapport journalier de chantier',
        motsCles: ['crj', 'journalier', 'npt', 'standby'],
      },
      {
        icon: Layers3,
        label: 'Tonnage échafaudage',
        path: 'tonnage-echaf',
        description: 'Montages, déposes et facturation',
        motsCles: ['échafaudage', 'gmi', 'm3'],
      },
      {
        icon: Wrench,
        label: 'Travaux METAL',
        path: 'travaux-metal',
        description: 'Affaires METAL et KPI associés',
        motsCles: ['sesi', 'avis', 'métal'],
      },
      {
        icon: Factory,
        label: 'Grand arrêt',
        path: 'grand-arret',
        description: 'Préfabrication et atelier',
        motsCles: ['préfa', 'soudage', 'iso'],
      },
      {
        icon: ShieldAlert,
        label: 'LUT intégrité',
        path: 'lut',
        description: 'Listes de travaux AGM / MDJ / TRM',
        motsCles: ['intégrité', 'agm', 'mdj', 'trm'],
      },
    ],
  },
  {
    titre: 'Achats & contrats',
    entrees: [
      {
        icon: PackageSearch,
        label: 'Procurement',
        path: 'procurement-suivi',
        description: 'DA, AO, PO et surveillance',
        motsCles: ['achat', 'da', 'ao', 'po', 'commande'],
      },
      {
        icon: FileText,
        label: 'Contrats',
        path: 'contrats',
        description: 'Valeur contractuelle vs consommation',
        motsCles: ['vc', 'consommation', 'portefeuille'],
      },
      {
        icon: PaintBucket,
        label: 'Contrat peinture',
        path: 'contrat-peinture',
        description: 'Journal de pointage et tarifs',
        motsCles: ['peinture', 'pointage'],
      },
      {
        icon: Users,
        label: 'Contrat EPCM',
        path: 'contrat-epcm',
        description: 'Personnel affecté et planning',
        motsCles: ['epcm', 'personnel', 'rotation', 'pointage'],
      },
    ],
  },
  {
    titre: 'Échanges',
    entrees: [
      {
        icon: MessagesSquare,
        label: 'Discussions',
        path: 'discussions',
        description: 'Sujets et fils de discussion',
        motsCles: ['chat', 'messages'],
      },
      {
        icon: Link2,
        label: 'Rapprochement',
        path: 'rapprochement',
        description: 'Liaisons entre modules à confirmer',
        motsCles: ['liaison', 'résolution'],
      },
    ],
  },
  {
    titre: 'Administration',
    entrees: [
      {
        icon: UserSquare2,
        label: 'Utilisateurs',
        path: 'agents',
        description: 'Comptes, rôles et profils de visa',
        motsCles: ['agents', 'rôle', 'compte'],
      },
      {
        icon: Coins,
        label: 'Devises',
        path: 'devises',
        description: 'Référentiel, taux de change et devise d’affichage',
        motsCles: ['devise', 'taux', 'change', 'conversion', 'usd', 'eur', 'xaf', 'monnaie'],
      },
      { icon: Settings, label: 'Paramètres', path: 'parametres', description: 'Réglages de l’application' },
    ],
  },
]

export const ENTREES_MENU: EntreeMenu[] = GROUPES_MENU.flatMap((g) => g.entrees)

export function entreeMenu(page: DashboardPage): EntreeMenu | undefined {
  return ENTREES_MENU.find((e) => e.path === page)
}
