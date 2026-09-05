import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { GROUPES_MENU, type EntreeMenu } from '../../lib/navigation'
import type { DashboardPage } from '../../types/navigation'

// Palette de commandes (⌘K / Ctrl+K) : aller à n'importe quel module en le
// tapant, sans parcourir 18 entrées de menu à la souris. Cherche aussi sur
// les mots-clés d'usage (« budget » → Navette, « préfa » → Grand arrêt), que
// les libellés du menu ne contiennent pas.

function correspond(entree: EntreeMenu, requete: string): boolean {
  const q = requete.trim().toLowerCase()
  if (!q) return true
  const cible = [entree.label, entree.description, ...(entree.motsCles ?? [])].join(' ').toLowerCase()
  // Chaque mot tapé doit être présent quelque part : « contrat pein » trouve
  // « Contrat peinture » sans imposer l'ordre exact.
  return q.split(/\s+/).every((mot) => cible.includes(mot))
}

export function PaletteCommandes({
  ouverte,
  onFermer,
  onNavigate,
  pagesAutorisees,
}: {
  ouverte: boolean
  onFermer: () => void
  onNavigate: (page: DashboardPage) => void
  pagesAutorisees: DashboardPage[]
}) {
  const [requete, setRequete] = useState('')
  const [index, setIndex] = useState(0)
  const champ = useRef<HTMLInputElement>(null)

  const groupes = useMemo(
    () =>
      GROUPES_MENU.map((g) => ({
        ...g,
        entrees: g.entrees.filter((e) => pagesAutorisees.includes(e.path) && correspond(e, requete)),
      })).filter((g) => g.entrees.length > 0),
    [requete, pagesAutorisees]
  )
  const resultats = useMemo(() => groupes.flatMap((g) => g.entrees), [groupes])

  // Remise à zéro à chaque ouverture : rouvrir sur la recherche précédente
  // oblige à effacer avant de pouvoir chercher autre chose.
  const [etaitOuverte, setEtaitOuverte] = useState(false)
  if (ouverte !== etaitOuverte) {
    setEtaitOuverte(ouverte)
    if (ouverte) {
      setRequete('')
      setIndex(0)
    }
  }

  useEffect(() => {
    if (ouverte) champ.current?.focus()
  }, [ouverte])

  if (!ouverte) return null

  const choisir = (page: DashboardPage) => {
    onNavigate(page)
    onFermer()
  }

  const auClavier = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => (resultats.length === 0 ? 0 : (i + 1) % resultats.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => (resultats.length === 0 ? 0 : (i - 1 + resultats.length) % resultats.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cible = resultats[Math.min(index, resultats.length - 1)]
      if (cible) choisir(cible.path)
    } else if (e.key === 'Escape') {
      onFermer()
    }
  }

  let compteur = -1

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24">
      <div className="absolute inset-0 bg-gray-900/40" onClick={onFermer} />
      <div
        role="dialog"
        aria-label="Rechercher un module"
        className="relative z-10 w-full max-w-xl bg-surface rounded-2xl shadow-overlay overflow-hidden apparition"
        onKeyDown={auClavier}
      >
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={champ}
            value={requete}
            onChange={(e) => {
              setRequete(e.target.value)
              setIndex(0)
            }}
            placeholder="Aller à un module…"
            className="flex-1 py-3.5 text-sm bg-transparent focus:outline-none placeholder-gray-400"
          />
          <kbd className="text-[10px] font-semibold text-gray-400 border border-line rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {resultats.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun module ne correspond.</p>
          ) : (
            groupes.map((groupe) => (
              <div key={groupe.titre}>
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {groupe.titre}
                </p>
                {groupe.entrees.map((entree) => {
                  compteur += 1
                  const actif = compteur === Math.min(index, resultats.length - 1)
                  return (
                    <button
                      key={entree.path}
                      type="button"
                      onMouseEnter={() => setIndex(GROUPES_MENU.length ? resultats.indexOf(entree) : 0)}
                      onClick={() => choisir(entree.path)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        actif ? 'bg-primary/5' : 'hover:bg-gray-50'
                      }`}
                    >
                      <entree.icon className={`w-4 h-4 shrink-0 ${actif ? 'text-primary' : 'text-gray-400'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm truncate ${actif ? 'text-primary font-medium' : 'text-gray-800'}`}>
                          {entree.label}
                        </span>
                        <span className="block text-xs text-gray-400 truncate">{entree.description}</span>
                      </span>
                      {actif && <CornerDownLeft className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
