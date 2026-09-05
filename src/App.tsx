import { lazy, Suspense, useState } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import { ProjectsProvider } from './contexts/ProjectsContext'
import { ContratsProvider } from './contexts/ContratsContext'
import { NavetteProvider } from './contexts/NavetteContext'
import { FeuilleDeRouteProvider } from './contexts/FeuilleDeRouteContext'
import { LiaisonProvider } from './contexts/LiaisonContext'
import { DevisesProvider } from './contexts/DevisesContext'
import { ListesValeursProvider } from './contexts/ListesValeursContext'
import { Login } from './pages/Login'
import type { TabKey } from './pages/ProjectDetailPage'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { SqueletteePage } from './components/ui/Squelette'
import { ROLE_PERMISSIONS } from './lib/permissions'
import type { DashboardPage } from './types/navigation'

// Chaque page est chargée à la demande (bundle initial trop gros sinon, cf.
// avertissement Vite "chunk > 500 kB") — une seule page est affichée à la
// fois (DashboardLayout), le découpage par page est donc naturel ici.
const NavettePage = lazy(() => import('./pages/NavettePage').then((m) => ({ default: m.NavettePage })))
const FeuilleDeRoutePage = lazy(() => import('./pages/FeuilleDeRoutePage').then((m) => ({ default: m.FeuilleDeRoutePage })))
const HSEPage = lazy(() => import('./pages/HSEPage').then((m) => ({ default: m.HSEPage })))
const TableauDeBordPage = lazy(() => import('./pages/TableauDeBordPage').then((m) => ({ default: m.TableauDeBordPage })))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })))
const TonnageEchafPage = lazy(() => import('./pages/TonnageEchafPage').then((m) => ({ default: m.TonnageEchafPage })))
const TravauxMetalPage = lazy(() => import('./pages/TravauxMetalPage').then((m) => ({ default: m.TravauxMetalPage })))
const ProcurementFollowUpPage = lazy(() => import('./pages/ProcurementFollowUpPage').then((m) => ({ default: m.ProcurementFollowUpPage })))
const SuiviHebdoCrjPage = lazy(() => import('./pages/SuiviHebdoCrjPage').then((m) => ({ default: m.SuiviHebdoCrjPage })))
const ContratPeinturePage = lazy(() => import('./pages/ContratPeinturePage').then((m) => ({ default: m.ContratPeinturePage })))
const ContratsPage = lazy(() => import('./pages/ContratsPage').then((m) => ({ default: m.ContratsPage })))
const ContratEpcmPage = lazy(() => import('./pages/ContratEpcmPage').then((m) => ({ default: m.ContratEpcmPage })))
const GrandArretPage = lazy(() => import('./pages/GrandArretPage').then((m) => ({ default: m.GrandArretPage })))
const LutPage = lazy(() => import('./pages/LutPage').then((m) => ({ default: m.LutPage })))
const RapprochementPage = lazy(() => import('./pages/RapprochementPage').then((m) => ({ default: m.RapprochementPage })))
const DiscussionsPage = lazy(() => import('./pages/DiscussionsPage').then((m) => ({ default: m.DiscussionsPage })))
const AgentsPage = lazy(() => import('./pages/AgentsPage').then((m) => ({ default: m.AgentsPage })))
const DevisesPage = lazy(() => import('./pages/DevisesPage').then((m) => ({ default: m.DevisesPage })))
const ParametresPage = lazy(() => import('./pages/ParametresPage').then((m) => ({ default: m.ParametresPage })))

function DashboardApp() {
  const { currentUser, chargement } = useAuth()
  const [currentPage, setCurrentPage] = useState<DashboardPage>('navette')
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null)
  const [viewingProjectTab, setViewingProjectTab] = useState<TabKey | undefined>(undefined)
  // Liste de valeurs visée par un lien « paramétrer ces valeurs » (22/08/2026) :
  // l'écran Paramètres s'ouvre alors sur l'onglet Listes de valeurs, au bon
  // module. Remise à zéro dès qu'on navigue ailleurs, sinon un retour sur
  // Paramètres par le menu rouvrirait la même cible sans raison.
  const [listeCible, setListeCible] = useState<string | undefined>(undefined)

  const openProject = (projetId: string, tab?: TabKey) => {
    setViewingProjectTab(tab)
    setViewingProjectId(projetId)
  }

  // Restauration de la session Firebase (onAuthStateChanged initial) : évite
  // un flash de la page de connexion avant de savoir si l'utilisateur est
  // déjà authentifié.
  if (chargement) {
    return null
  }

  if (!currentUser) {
    return <Login />
  }

  const allowedPages = ROLE_PERMISSIONS[currentUser.role]
  const page = allowedPages.includes(currentPage) ? currentPage : allowedPages[0]

  const navigate = (target: DashboardPage) => {
    setViewingProjectId(null)
    setListeCible(undefined)
    setCurrentPage(target)
  }

  /** Ouvre Paramètres › Listes de valeurs sur une liste précise. */
  const ouvrirListeValeurs = (id: string) => {
    setViewingProjectId(null)
    setListeCible(id)
    setCurrentPage('parametres')
  }

  const pageContent = viewingProjectId ? (
    <ProjectDetailPage
      projetId={viewingProjectId}
      initialTab={viewingProjectTab}
      onBack={() => setViewingProjectId(null)}
      onOuvrirListeValeurs={ouvrirListeValeurs}
    />
  ) : (
    {
      navette: <NavettePage />,
      'feuille-de-route': (
        <FeuilleDeRoutePage
          onOpenProject={(id) => openProject(id, 'budget')}
          onOpenNavette={() => navigate('navette')}
        />
      ),
      hse: <HSEPage />,
      'tableau-de-bord': <TableauDeBordPage />,
      projets: <ProjectsPage onOpenProject={(id) => openProject(id)} />,
      'tonnage-echaf': <TonnageEchafPage />,
      'travaux-metal': <TravauxMetalPage onOpenContrats={() => navigate('contrats')} />,
      'procurement-suivi': <ProcurementFollowUpPage />,
      'suivi-hebdo-crj': <SuiviHebdoCrjPage />,
      'contrat-peinture': <ContratPeinturePage />,
      contrats: <ContratsPage />,
      'contrat-epcm': <ContratEpcmPage />,
      'grand-arret': <GrandArretPage />,
      lut: <LutPage />,
      rapprochement: <RapprochementPage />,
      discussions: <DiscussionsPage />,
      agents: <AgentsPage />,
      devises: <DevisesPage />,
      parametres: <ParametresPage listeCible={listeCible} />,
    }[page]
  )

  return (
    <DashboardLayout currentPage={page} onNavigate={navigate}>
      <Suspense fallback={<SqueletteePage />}>{pageContent}</Suspense>
    </DashboardLayout>
  )
}

function App() {
  return (
    <AuthProvider>
      {/* Le référentiel des devises est lu par tous les champs de montant :
          son provider enveloppe donc tous les autres. */}
      <DevisesProvider>
        <ListesValeursProvider>
          <ProjectsProvider>
            <ContratsProvider>
              <NavetteProvider>
                <FeuilleDeRouteProvider>
                  <LiaisonProvider>
                    <DashboardApp />
                  </LiaisonProvider>
                </FeuilleDeRouteProvider>
              </NavetteProvider>
            </ContratsProvider>
          </ProjectsProvider>
        </ListesValeursProvider>
      </DevisesProvider>
    </AuthProvider>
  )
}

export default App
