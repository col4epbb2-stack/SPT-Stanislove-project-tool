import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// État vide : un « Aucun résultat » gris de 12 px ne dit ni pourquoi c'est
// vide, ni quoi faire. Trois cas se ressemblent dans l'app et méritent des
// textes différents — rien n'a encore été saisi, les filtres excluent tout,
// ou la donnée n'a pas pu être chargée.

export function EtatVide({
  icone: Icone,
  titre,
  description,
  action,
  compact,
}: {
  icone: LucideIcon
  titre: string
  description?: ReactNode
  action?: ReactNode
  // Version en ligne, pour l'intérieur d'une cellule de tableau.
  compact?: boolean
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-8' : 'py-14'}`}>
      <span className="w-11 h-11 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
        <Icone className="w-5 h-5" />
      </span>
      <p className="text-sm font-medium text-gray-700">{titre}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
