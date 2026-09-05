import { useAuth } from '../../contexts/useAuth'

// Filtre « mon périmètre » (restriction du CDS pour le rôle agent) : ne
// garder que les lignes résolues vers un projet dont l'agent est le chargé
// d'affaires. Invisible pour les admins, qui voient tout par défaut.
export function MonPerimetreToggle({ actif, onChange }: { actif: boolean; onChange: (actif: boolean) => void }) {
  const { currentUser } = useAuth()
  if (currentUser?.role !== 'agent') return null

  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap cursor-pointer select-none pb-2">
      <input
        type="checkbox"
        checked={actif}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-primary focus:ring-primary/40"
      />
      Mon périmètre
    </label>
  )
}
