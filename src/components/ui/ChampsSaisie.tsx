import type { ReactNode } from 'react'
import { Settings2 } from 'lucide-react'
import { champFormClass } from './classes'

// Champs de formulaire réutilisés par les modales de saisie (Tonnage
// échafaudage, Facturation au point, CRJ). `DatalistInput` et `ChampDerive`
// vivaient chacun dans un seul formulaire alors qu'ils décrivent des besoins
// partagés : proposer les valeurs déjà utilisées sans interdire une nouvelle
// (doc/commentaires CRJ.docx : "si demain un type d'équipement n'apparaît pas
// dans la liste proposée, je pourrai tout de même l'ajouter manuellement"),
// et afficher en lecture seule une valeur reprise d'une autre feuille.

export function DatalistInput({
  label,
  value,
  onChange,
  options,
  id,
  placeholder,
  administree,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  id: string
  placeholder?: string
  /**
   * Les suggestions de ce champ viennent (au moins en partie) d'une liste
   * administrée depuis Paramètres › Listes de valeurs (04/09/2026, module
   * Travaux METAL, MET-64 — "il serait pertinent d'ajouter une distinction
   * visuelle" pour les "données administrées en back end"). Un champ à
   * suggestions purement dérivées des données existantes n'a rien à
   * administrer — l'icône ne se pose donc que sur les champs qui en ont un,
   * pas sur `DatalistInput` en général.
   */
  administree?: boolean
}) {
  return (
    <div className="w-full">
      <label className="flex items-center gap-1 text-sm font-medium mb-1.5 text-gray-500">
        {label}
        {administree && (
          <Settings2
            className="w-3 h-3 text-indigo-400 shrink-0"
            aria-hidden="true"
          />
        )}
      </label>
      <input
        list={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        title={administree ? 'Suggestions administrées depuis Paramètres › Listes de valeurs' : undefined}
        className={administree ? `${champFormClass} ring-1 ring-indigo-200/70` : champFormClass}
      />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  )
}

// Valeur non saisie : reprise d'une autre feuille (ex. dimensions dérivées du
// Journal montage/dépose) ou calculée par un moteur. Affichée dans le
// formulaire pour que l'utilisateur voie ce qui sera enregistré, jamais
// éditable.
export function ChampDerive({
  label,
  valeur,
  aide,
}: {
  label: string
  valeur: string | number | null
  aide?: string
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-h-10">
        {valeur ?? '—'}
      </p>
      {aide && <p className="text-[10px] text-gray-400 mt-1">{aide}</p>}
    </div>
  )
}

export function SelectChamp({
  label,
  value,
  onChange,
  options,
  libelles,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options?: string[]
  /**
   * Libellé lisible d'une option, quand la valeur stockée est un code
   * (`AGREMENT` → « Freelance (agrément) », un identifiant d'employé → son
   * nom). Sans lui, l'écran afficherait la valeur technique.
   */
  libelles?: Record<string, string>
  children?: ReactNode
}) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium mb-1.5 text-gray-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={champFormClass}>
        <option value="">—</option>
        {options?.map((o) => (
          <option key={o} value={o}>
            {libelles?.[o] ?? o}
          </option>
        ))}
        {children}
      </select>
    </div>
  )
}

// Titre + sous-titre d'une étape de formulaire — chaque étape s'ouvre en
// disant ce qu'elle attend, sinon découper le formulaire ne fait que masquer
// des champs.
export function EnteteSection({ titre, aide }: { titre: string; aide?: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">{titre}</p>
      {aide && <p className="text-xs text-gray-500 mt-0.5">{aide}</p>}
    </div>
  )
}
