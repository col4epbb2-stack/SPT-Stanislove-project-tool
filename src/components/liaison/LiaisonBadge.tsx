import { Link2 } from 'lucide-react'
import type { Resolution } from '../../types/liaison'
import { METHODE_LIAISON_LABELS } from '../../types/liaison'

// Badge « Lié à la fiche X » affiché dans les tables des pages portfolio.
// Le détail (méthode de la cascade + clé qui a matché) est porté par le title.
export function LiaisonBadge({ resolution, nomProjet }: { resolution: Resolution | null; nomProjet?: string }) {
  if (!resolution) {
    return <span className="text-xs text-gray-300 whitespace-nowrap">Non lié</span>
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 max-w-48"
      title={`Lié à la fiche « ${nomProjet ?? '?'} » par ${METHODE_LIAISON_LABELS[resolution.methode]} (${resolution.cleValeur})`}
    >
      <Link2 className="w-3 h-3 shrink-0" />
      <span className="truncate">{nomProjet ?? 'Fiche projet'}</span>
    </span>
  )
}
