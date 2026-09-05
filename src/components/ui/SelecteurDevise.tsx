import { useDevises } from '../../contexts/useDevises'
import type { CodeDevise } from '../../types/devise'

// Choix de la devise d'une donnée qui porte la sienne (ligne navette, fiche
// projet, contrat EPCM). Les options viennent du référentiel — trois codes
// étaient jusqu'ici écrits en dur dans chacune de ces modales, et le contrat
// EPCM demandait même sa devise en texte libre, ce qui laissait entrer
// n'importe quelle chaîne dans un champ censé porter un code ISO.

export function SelecteurDevise({
  label = 'Devise',
  value,
  onChange,
  disabled,
  className = '',
}: {
  label?: string
  value: CodeDevise
  onChange: (code: CodeDevise) => void
  disabled?: boolean
  className?: string
}) {
  const { devises } = useDevises()
  // Une devise retirée du référentiel reste proposée si la donnée la porte
  // déjà : sinon, ouvrir la fiche la changerait silencieusement.
  const options = devises.filter((d) => d.actif || d.code === value)

  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-medium text-gray-500 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
      >
        {options.map((d) => (
          <option key={d.code} value={d.code}>
            {d.code} — {d.libelle}
          </option>
        ))}
      </select>
    </div>
  )
}
