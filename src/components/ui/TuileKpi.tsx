import type { ReactNode } from 'react'
import { TONS_KPI, type TonKpi } from './tonsKpi'

// Tuile d'indicateur : icône colorée, libellé, valeur, détail et barre de
// progression optionnelle. Écrite pour le bandeau de la Navette
// (components/navette/IndicateursNavette.tsx), remontée ici dès son second
// usage (Feuille de route) plutôt que recopiée.

export function TuileKpi({
  libelle,
  valeur,
  detail,
  icone,
  ton = 'primary',
  progression,
}: {
  // `ReactNode` et non `string` : la tuile « Total PDC » de la navette porte
  // son sélecteur de cycle dans son libellé (21/08/2026), là où se pose la
  // question « laquelle ? ». Les autres tuiles continuent d'y passer du texte.
  libelle: ReactNode
  valeur: string
  detail?: ReactNode
  icone: ReactNode
  ton?: TonKpi
  // 0 → 1 : barre fine sous la valeur, clampée pour rester dans la tuile.
  progression?: number
}) {
  const tons = TONS_KPI[ton]
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-start gap-3">
      <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${tons.fond} ${tons.texte}`}>
        {icone}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-gray-500 truncate">{libelle}</div>
        <p className="text-xl font-bold text-gray-900 tabular-nums truncate">{valeur}</p>
        {progression !== undefined && (
          <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${tons.barre}`}
              style={{ width: `${Math.min(100, Math.max(0, progression * 100))}%` }}
            />
          </div>
        )}
        {detail && <p className="text-xs text-gray-400 mt-1 truncate">{detail}</p>}
      </div>
    </div>
  )
}

// Barre de progression en ligne, pour une cellule de tableau ou un bloc de
// détail : le pourcentage seul se lit mal quand il y en a une colonne entière.
export function BarreProgression({
  valeur,
  ton = 'primary',
  libelle,
}: {
  // Pourcentage 0 → 100 ; `null` affiche un tiret (donnée absente, pas 0 %).
  valeur: number | null
  ton?: TonKpi
  libelle?: string
}) {
  if (valeur == null) return <span className="text-gray-300">—</span>
  const tons = TONS_KPI[ton]
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full ${tons.barre}`}
          style={{ width: `${Math.min(100, Math.max(0, valeur))}%` }}
        />
      </div>
      <span className="text-gray-700 tabular-nums w-10 text-right">{libelle ?? `${Math.round(valeur)}%`}</span>
    </div>
  )
}
