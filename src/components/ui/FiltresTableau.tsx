import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { rechercheClass, selectFiltreClass } from './classes'

// Barre de filtres au-dessus d'un grand tableau. Le trio "label + select
// Tous + options", le champ de recherche à loupe et le compteur
// "n / total lignes" étaient réécrits à l'identique dans chaque onglet
// (Journal montage/dépose, Suivi personnel, SUIVI DES ACTIVITES…) — une
// dizaine de copies du même bloc de 12 lignes.

export function FiltreSelect({
  label,
  value,
  onChange,
  options,
  libelleTous = 'Tous',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  libelleTous?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select className={selectFiltreClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{libelleTous}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ChampRecherche({
  value,
  onChange,
  placeholder,
  label = 'Recherche',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label?: string
}) {
  return (
    <div className="relative flex-1 min-w-55">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 mt-1" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={rechercheClass}
      />
    </div>
  )
}

export function BarreFiltresTableau({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 p-5 border-b border-gray-200">{children}</div>
}

export function CompteurLignes({ filtrees, total, suffixe }: { filtrees: string; total: string; suffixe?: ReactNode }) {
  return (
    <span className="text-xs text-gray-500 whitespace-nowrap">
      {filtrees} / {total} lignes{suffixe}
    </span>
  )
}
