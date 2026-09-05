import { useState, type ReactNode } from 'react'
import { ChevronDown, Info } from 'lucide-react'

// En-tête de page : titre optionnel, actions à droite, et surtout le
// paragraphe d'explication du module. Plusieurs pages ouvraient sur un pavé
// de 5 à 8 lignes décrivant le classeur source (Peinture, Tonnage, Grand
// arrêt, Procurement…) : une information utile la première fois, qui repousse
// ensuite le contenu utile sous la ligne de flottaison à chaque visite.
// Elle est donc repliée par défaut derrière « À propos de ce module ».

export function EnTetePage({
  titre,
  description,
  actions,
  aide,
}: {
  titre?: string
  // Une ligne, toujours visible.
  description?: ReactNode
  actions?: ReactNode
  // Le pavé long, replié par défaut.
  aide?: ReactNode
}) {
  const [aideOuverte, setAideOuverte] = useState(false)

  return (
    <div className="space-y-2">
      {(titre || actions || description) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {titre && <h2 className="text-base font-semibold text-gray-900">{titre}</h2>}
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}

      {aide && (
        <div>
          <button
            type="button"
            onClick={() => setAideOuverte((v) => !v)}
            aria-expanded={aideOuverte}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            À propos de ce module
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aideOuverte ? 'rotate-180' : ''}`} />
          </button>
          {aideOuverte && (
            <div className="mt-2 text-xs leading-relaxed text-gray-600 carte p-4 apparition">{aide}</div>
          )}
        </div>
      )}
    </div>
  )
}
