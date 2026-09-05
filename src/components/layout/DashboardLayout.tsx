import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { HardHat, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { ROLE_LABELS, PROFIL_NAVETTE_LABELS } from '../../types/user'
import type { DashboardPage } from '../../types/navigation'
import { ROLE_PERMISSIONS } from '../../lib/permissions'
import { getAvatarColor } from '../../lib/avatarColors'
import { GROUPES_MENU, entreeMenu } from '../../lib/navigation'
import { usePreferenceAffichage } from '../../lib/preferencesAffichage'
import { PaletteCommandes } from './PaletteCommandes'
import { BandeauIncidents } from './BandeauIncidents'
import { IndicateurDeviseSysteme } from './IndicateurDeviseSysteme'

interface DashboardLayoutProps {
  currentPage: DashboardPage
  onNavigate: (page: DashboardPage) => void
  children: ReactNode
}

export function DashboardLayout({ currentPage, onNavigate, children }: DashboardLayoutProps) {
  const { currentUser, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOuverte, setPaletteOuverte] = useState(false)
  // Barre réduite au rail d'icônes : ces écrans portent des tableaux de 20 à
  // 50 colonnes, récupérer 200 px de large change vraiment la lecture. Le
  // choix est propre au poste, donc en localStorage comme les autres
  // préférences d'affichage.
  const [reduite, setReduite] = usePreferenceAffichage<boolean>('shell.sidebarReduite', false)

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOuverte((v) => !v)
      }
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [])

  if (!currentUser) return null

  const allowedPages = ROLE_PERMISSIONS[currentUser.role]
  const groupesVisibles = GROUPES_MENU.map((g) => ({
    ...g,
    entrees: g.entrees.filter((e) => allowedPages.includes(e.path)),
  })).filter((g) => g.entrees.length > 0)
  const avatarColor = getAvatarColor(currentUser.avatarColor)
  const pageCourante = entreeMenu(currentPage)

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false)
  }

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-gray-900/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-30 flex flex-col bg-primary text-white transition-[transform,width] duration-200 ${
          reduite ? 'w-64 lg:w-18' : 'w-64'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className={`flex items-center gap-3 shrink-0 h-16 ${reduite ? 'lg:justify-center px-4' : 'px-5'}`}>
          <div className="bg-white/15 p-2 rounded-xl border border-white/20 shrink-0">
            <HardHat className="w-5 h-5 text-accent-light" />
          </div>
          <div className={reduite ? 'lg:hidden' : ''}>
            <p className="text-base font-bold tracking-wide leading-tight">ICP</p>
            <p className="text-accent-light text-[10px] font-medium tracking-[0.18em] uppercase">Gestion de projets</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {groupesVisibles.map((groupe) => (
            <div key={groupe.titre}>
              <p
                className={`px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40 ${
                  reduite ? 'lg:sr-only' : ''
                }`}
              >
                {groupe.titre}
              </p>
              <div className="space-y-0.5">
                {groupe.entrees.map((item) => {
                  const actif = currentPage === item.path
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        onNavigate(item.path)
                        closeSidebarOnMobile()
                      }}
                      title={reduite ? item.label : undefined}
                      aria-current={actif ? 'page' : undefined}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                        reduite ? 'lg:justify-center' : ''
                      } ${actif ? 'bg-white/15 font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                    >
                      {/* Repère d'onglet actif : sur un fond uni, un simple
                          changement d'opacité se repère mal du coin de l'œil. */}
                      {actif && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-accent-light" />
                      )}
                      <item.icon className="w-5 h-5 shrink-0" />
                      <span className={`text-sm truncate ${reduite ? 'lg:hidden' : ''}`}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 shrink-0">
          <div className={`flex items-center gap-3 mb-3 ${reduite ? 'lg:justify-center' : ''}`}>
            <div
              title={currentUser.name}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${avatarColor.bgClass}`}
            >
              <span className={`text-xs font-bold ${avatarColor.textClass}`}>{currentUser.initials}</span>
            </div>
            <div className={`flex-1 min-w-0 ${reduite ? 'lg:hidden' : ''}`}>
              <p className="text-sm font-medium truncate">{currentUser.name}</p>
              <p className="text-xs text-white/60 truncate">
                {ROLE_LABELS[currentUser.role]}
                {currentUser.profilNavette && ` · ${PROFIL_NAVETTE_LABELS[currentUser.profilNavette]}`}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Déconnexion"
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors ${
              reduite ? 'lg:justify-center' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className={reduite ? 'lg:hidden' : ''}>Déconnexion</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-surface border-b border-line px-4 sm:px-6 h-16 shrink-0 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Ouvrir le menu"
            className="text-gray-600 hover:text-gray-900 transition-colors p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 lg:hidden shrink-0"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setReduite(!reduite)}
            aria-label={reduite ? 'Déplier le menu' : 'Replier le menu'}
            title={reduite ? 'Déplier le menu' : 'Replier le menu'}
            className="hidden lg:flex text-gray-400 hover:text-gray-900 transition-colors p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 shrink-0"
          >
            {reduite ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-gray-900 truncate leading-tight">
              {pageCourante?.label ?? 'ICP'}
            </h1>
            {pageCourante?.description && (
              <p className="text-xs text-gray-500 truncate">{pageCourante.description}</p>
            )}
          </div>

          <IndicateurDeviseSysteme onOuvrirDevises={() => onNavigate('devises')} />

          <button
            onClick={() => setPaletteOuverte(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface-muted text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors shrink-0"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Rechercher un module</span>
            <kbd className="hidden sm:inline text-[10px] font-semibold border border-line bg-surface rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </button>
        </header>

        <main className="flex-1 overflow-auto">
          {/* Hors du padding du contenu : le bandeau doit se voir avant le
              titre de la page, pas se fondre dedans. */}
          <BandeauIncidents />
          <div className="p-4 sm:p-6">{children}</div>
        </main>
      </div>

      <PaletteCommandes
        ouverte={paletteOuverte}
        onFermer={() => setPaletteOuverte(false)}
        onNavigate={onNavigate}
        pagesAutorisees={allowedPages}
      />
    </div>
  )
}
