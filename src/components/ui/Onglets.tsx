import type { LucideIcon } from 'lucide-react'

// Barre d'onglets partagée. Le même bloc de balisage était recopié à
// l'identique dans 8 pages (fiche projet, Tonnage, METAL, Procurement,
// Peinture, Grand arrêt, LUT, EPCM) — à chaque fois les mêmes classes, au
// pixel près, sans moyen d'y ajouter quoi que ce soit sans le faire 8 fois.
//
// Ce que la version partagée apporte en plus de la factorisation : un état
// actif lisible (fond teinté, pas seulement un trait), un survol qui répond,
// un compteur optionnel par onglet, et le rôle ARIA `tablist` qui manquait.

export interface Onglet<K extends string> {
  key: K
  label: string
  // Nombre d'éléments derrière l'onglet (lignes, alertes…) — affiché en
  // pastille : savoir qu'un onglet est vide évite d'aller y regarder.
  compteur?: number
  icone?: LucideIcon
}

export function Onglets<K extends string>({
  onglets,
  actif,
  onChange,
  ariaLabel = 'Sections',
}: {
  onglets: Onglet<K>[]
  actif: K
  onChange: (cle: K) => void
  ariaLabel?: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-line overflow-x-auto">
      {onglets.map((o) => {
        const estActif = o.key === actif
        return (
          <button
            key={o.key}
            role="tab"
            type="button"
            aria-selected={estActif}
            onClick={() => onChange(o.key)}
            className={`group inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 rounded-t-lg transition-colors ${
              estActif
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {o.icone && <o.icone className="w-4 h-4 shrink-0" />}
            {o.label}
            {o.compteur !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                  estActif ? 'bg-primary/15 text-primary' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {o.compteur}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
