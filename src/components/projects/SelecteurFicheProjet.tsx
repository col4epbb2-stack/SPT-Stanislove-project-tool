import { useMemo } from 'react'
import { useProjects } from '../../contexts/useProjects'
import type { Projet } from '../../types/project'

// Sélecteur de fiche projet pour les formulaires de saisie des journaux
// (13/08/2026). Le rattachement d'une ligne de journal à une fiche reposait
// jusqu'ici entièrement sur la cascade de résolution floue (nom, n° d'avis,
// site) : elle devine, alors que la personne qui saisit, elle, sait. Choisir
// la fiche ici pose un lien explicite (`projetId` sur la ligne) qui prime sur
// la cascade et ne casse pas si on renomme la fiche ensuite.
//
// Volontairement facultatif : beaucoup de lignes de journal ne concernent
// aucune fiche projet (travaux récurrents, prestations hors projet). Forcer
// un choix produirait des rattachements faux, pires que pas de rattachement.

export function SelecteurFicheProjet({
  valeur,
  onChange,
  label = 'Fiche projet rattachée',
  aide = 'Facultatif. Rattache cette ligne à une fiche projet de façon définitive, sans dépendre du nom saisi.',
}: {
  valeur: string | null | undefined
  // Reçoit la fiche choisie (ou `null`) pour que l'appelant préremplisse ses
  // propres champs — chaque journal a les siens.
  onChange: (projet: Projet | null) => void
  label?: string
  aide?: string
}) {
  const { projects } = useProjects()
  const tries = useMemo(() => [...projects].sort((a, b) => a.nom.localeCompare(b.nom)), [projects])

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-500">{label}</label>
      <select
        value={valeur ?? ''}
        onChange={(e) => onChange(tries.find((p) => p.id === e.target.value) ?? null)}
        className="w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition"
      >
        <option value="">— Aucune —</option>
        {tries.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">{aide}</p>
    </div>
  )
}
