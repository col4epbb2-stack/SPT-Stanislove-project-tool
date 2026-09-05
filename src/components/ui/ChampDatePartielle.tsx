import { useState } from 'react'
import { precisionDate } from '../../lib/datesPartielles'
import type { PrecisionDate } from '../../lib/datesPartielles'

/**
 * Date à précision variable (`doc/module contrat_rev01.docx` §3) : « Exemples
 * autorisés : **Jour + mois + année ou Mois + année uniquement**. »
 *
 * Deux champs natifs, un par précision — `type="date"` rend `YYYY-MM-DD`,
 * `type="month"` rend `YYYY-MM`, exactement les deux formes que l'application
 * stocke. Rien à convertir, aucun analyseur maison, et le sélecteur du
 * navigateur reste celui que l'utilisateur connaît.
 *
 * **Passer au mois garde le mois ; revenir au jour n'invente pas de jour** :
 * `2026-03-17` → `2026-03` conserve ce qui est encore vrai, alors que
 * `2026-03` → un jour précis demanderait d'en choisir un. Le champ se vide
 * donc et le dit, plutôt que de poser le 1ᵉʳ du mois — c'est la même règle que
 * partout ici : on ne comble pas une donnée absente par une valeur plausible.
 */
export function ChampDatePartielle({
  label,
  value,
  onChange,
  className = '',
  aide,
}: {
  label: string
  value?: string
  onChange: (valeur: string) => void
  className?: string
  /** Note affichée sous le champ (ex. la borne d'un KPI). */
  aide?: string
}) {
  const [precisionChoisie, setPrecisionChoisie] = useState<PrecisionDate>(precisionDate(value) ?? 'jour')
  // La valeur fait foi quand elle est renseignée : rouvrir une facture dont la
  // date est au mois doit montrer le champ « Mois + année », pas l'inverse.
  const precision = precisionDate(value) ?? precisionChoisie

  const changerPrecision = (voulue: PrecisionDate) => {
    setPrecisionChoisie(voulue)
    if (!value) return
    if (voulue === 'mois') onChange(value.slice(0, 7))
    else onChange('')
  }

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label className="block text-sm font-medium text-gray-500">{label}</label>
        <div className="flex gap-0.5 shrink-0" role="group" aria-label={`Précision de « ${label} »`}>
          {(['jour', 'mois'] as PrecisionDate[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => changerPrecision(p)}
              aria-pressed={precision === p}
              className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                precision === p ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-gray-600'
              }`}
              title={p === 'jour' ? 'Jour + mois + année' : 'Mois + année uniquement'}
            >
              {p === 'jour' ? 'J/M/A' : 'M/A'}
            </button>
          ))}
        </div>
      </div>
      <input
        type={precision === 'jour' ? 'date' : 'month'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition"
      />
      {aide && <p className="mt-1 text-xs text-gray-400">{aide}</p>}
    </div>
  )
}
