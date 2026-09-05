import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AFFECTATIONS, TYPES_AFFECTATION_SAISIE, decalerMois, libelleMois } from '../../lib/contratEpcmEngine'
import { useDevises } from '../../contexts/useDevises'
import type { CodeDevise } from '../../types/devise'
import type { TypeAffectation } from '../../types/contratEpcm'

// Briques d'affichage communes aux onglets du module Contrat EPCM
// (08/08/2026) — même rôle que components/procurement/elements.tsx.

export function StatCard({
  label,
  valeur,
  detail,
  ton = 'neutre',
}: {
  label: string
  valeur: ReactNode
  detail?: ReactNode
  ton?: 'neutre' | 'positif' | 'attention' | 'critique'
}) {
  const tons = {
    neutre: 'text-gray-900',
    positif: 'text-green-600',
    attention: 'text-orange-600',
    critique: 'text-red-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tons[ton]}`}>{valeur}</p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
    </div>
  )
}

export function PastilleAffectation({ type, compact = false }: { type: TypeAffectation; compact?: boolean }) {
  const info = AFFECTATIONS[type]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${info.classeDouce} ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${info.classe.split(' ')[0]}`} />
      {info.label}
    </span>
  )
}

export function LegendeAffectations() {
  // La légende suit la palette : elle ne nomme que ce qui peut être posé
  // (rev01, point Planning). Les affectations historiques restent affichées
  // dans les cases qui les portent, avec leur propre pastille.
  return (
    <div className="flex flex-wrap gap-2">
      {TYPES_AFFECTATION_SAISIE.map((type) => (
        <PastilleAffectation key={type} type={type} compact />
      ))}
    </div>
  )
}

export function SelecteurMois({ mois, onChange }: { mois: string; onChange: (mois: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(decalerMois(mois, -1))}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Mois précédent"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-semibold text-gray-900 min-w-36 text-center capitalize">{libelleMois(mois)}</span>
      <button
        onClick={() => onChange(decalerMois(mois, 1))}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Mois suivant"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

export function JaugeBudget({ pct }: { pct: number | null }) {
  if (pct == null) return <p className="text-xs text-gray-400">Budget non défini</p>
  const borne = Math.min(pct, 1)
  const couleur = pct > 1 ? 'bg-red-500' : pct >= 0.9 ? 'bg-orange-500' : pct >= 0.8 ? 'bg-amber-400' : 'bg-green-500'
  return (
    <div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${couleur}`} style={{ width: `${borne * 100}%` }} />
      </div>
      {pct > 1 && <p className="text-[11px] text-red-600 mt-1 font-medium">Dépassement de {Math.round((pct - 1) * 100)} %</p>}
    </div>
  )
}

export function EnteteOnglet({
  titre,
  aide,
  children,
}: {
  titre: string
  aide?: string
  children?: ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-gray-900">{titre}</h3>
        {aide && <p className="text-xs text-gray-500 mt-1 max-w-2xl">{aide}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap shrink-0">{children}</div>
    </div>
  )
}

export function MessageVide({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-300 px-5 py-10 text-center">
      <p className="text-sm text-gray-500">{children}</p>
    </div>
  )
}

/**
 * Devise d'affichage **du module** (`doc/EPCM_rev01.docx`, point 7 :
 * « Aujourd'hui, il faut passer par les paramètres pour changer de devise. Ce
 * fonctionnement n'est pas pratique. […] l'interface convertirait ou
 * afficherait automatiquement les montants dans une autre devise de référence
 * (USD ou EUR) »).
 *
 * **Elle ne change que l'affichage.** L'enregistrement reste dans la devise du
 * contrat EPCM, et la saisie continue de se faire dans la devise du système —
 * le sélecteur de devise de frappe retiré des champs le 19/08/2026 n'est pas
 * rétabli (choix explicite du 27/08/2026).
 *
 * `null` = suivre la devise du système, comme le reste de l'application : le
 * module ne s'en écarte que si on le lui demande.
 */
export function SelecteurDeviseAffichage({
  value,
  onChange,
}: {
  value: CodeDevise | null
  onChange: (code: CodeDevise | null) => void
}) {
  const { devises, pivot } = useDevises()
  const proposables = devises.filter((d) => d.actif || d.code === value)

  return (
    <label className="flex items-center gap-2 text-xs text-gray-500">
      <span className="whitespace-nowrap">Afficher en</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      >
        <option value="">Devise du système ({pivot.code})</option>
        {proposables.map((d) => (
          <option key={d.code} value={d.code}>
            {d.code} — {d.libelle}
          </option>
        ))}
      </select>
    </label>
  )
}
