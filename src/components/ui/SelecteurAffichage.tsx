import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Lock } from 'lucide-react'

// Menu déroulant à cases à cocher : sert à choisir ce qui est affiché
// (colonnes d'un grand tableau, sections d'une page) plutôt qu'à filtrer les
// lignes. Séparé de FiltresTableau volontairement : un filtre change le jeu
// de données, celui-ci ne change que ce qu'on en montre.

export interface OptionAffichage {
  id: string
  label: string
  // Précision affichée en gris sous le libellé (unité, rappel de calcul…).
  indice?: string
}

export interface GroupeAffichage {
  titre?: string
  options: OptionAffichage[]
}

export interface PresetAffichage {
  label: string
  ids: string[]
}

interface SelecteurAffichageProps {
  libelle: string
  icone?: ReactNode
  groupes: GroupeAffichage[]
  selection: string[]
  onChange: (ids: string[]) => void
  // Vues prêtes à l'emploi ("Synthèse", "Tout"…) : un clic remplace la
  // sélection complète.
  presets?: PresetAffichage[]
  // Options toujours cochées et non décochables (colonne d'identification
  // sans laquelle le tableau devient illisible).
  verrouilles?: string[]
  alignement?: 'gauche' | 'droite'
}

export function SelecteurAffichage({
  libelle,
  icone,
  groupes,
  selection,
  onChange,
  presets,
  verrouilles = [],
  alignement = 'droite',
}: SelecteurAffichageProps) {
  const [ouvert, setOuvert] = useState(false)
  const conteneur = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false)
    }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [ouvert])

  const toutes = groupes.flatMap((g) => g.options.map((o) => o.id))
  const cochees = toutes.filter((id) => selection.includes(id))

  const basculerOption = (id: string) => {
    if (verrouilles.includes(id)) return
    onChange(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id])
  }

  return (
    <div className="relative" ref={conteneur}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
          ouvert
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white'
        }`}
      >
        {icone}
        {libelle}
        <span className="text-xs font-semibold text-gray-500 tabular-nums">
          {cochees.length}/{toutes.length}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <div
          className={`absolute z-30 mt-2 w-64 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg ${
            alignement === 'droite' ? 'right-0' : 'left-0'
          }`}
        >
          {presets && presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-3 border-b border-gray-100">
              {presets.map((p) => {
                const actif =
                  p.ids.length === cochees.length && p.ids.every((id) => selection.includes(id))
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onChange([...new Set([...p.ids, ...verrouilles])])}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                      actif ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          )}

          <div className="py-1">
            {groupes.map((groupe, i) => (
              <div key={groupe.titre ?? i}>
                {groupe.titre && (
                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {groupe.titre}
                  </p>
                )}
                {groupe.options.map((option) => {
                  const coche = selection.includes(option.id)
                  const verrouille = verrouilles.includes(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={verrouille}
                      onClick={() => basculerOption(option.id)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2 text-left text-sm transition ${
                        verrouille ? 'cursor-default text-gray-400' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                          coche ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {coche && <Check className="w-3 h-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.indice && <span className="block text-xs text-gray-400">{option.indice}</span>}
                      </span>
                      {verrouille && <Lock className="w-3 h-3 mt-1 shrink-0 text-gray-300" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
