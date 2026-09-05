import { Coins } from 'lucide-react'
import { useDevises } from '../../contexts/useDevises'

// Indication permanente de la devise dans laquelle l'application affiche ses
// montants (19/08/2026, demande explicite « la devise définie dans le système
// va afficher une information pour toutes les interfaces »).
//
// Posée dans la barre supérieure de la coque, donc présente sur les 20 écrans
// sans avoir à être répétée dans chacun. C'est la contrepartie nécessaire de
// la conversion à l'affichage : un tableau converti sans rien dire laisserait
// croire que ses chiffres sont ceux du classeur source.
//
// Elle mène à l'écran Devises, où se lit le taux appliqué module par module —
// une information affichée sans moyen de la vérifier n'aiderait personne.

export function IndicateurDeviseSysteme({ onOuvrirDevises }: { onOuvrirDevises: () => void }) {
  const { pivot, referentielVierge } = useDevises()

  return (
    <button
      type="button"
      onClick={onOuvrirDevises}
      title={
        referentielVierge
          ? `Montants affichés en ${pivot.code} (${pivot.libelle}) — référentiel des devises non encore enregistré`
          : `Montants affichés en ${pivot.code} (${pivot.libelle}) — voir les taux appliqués`
      }
      className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-line bg-surface-muted text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors shrink-0"
    >
      <Coins className="w-4 h-4" />
      <span className="font-semibold tabular-nums">{pivot.code}</span>
      {/* Le point ambre dit que ces taux sont ceux livrés par défaut et qu'aucun
          administrateur ne les a validés — la même réserve que sur l'écran
          Devises, portée jusque dans les écrans qui s'en servent. */}
      {referentielVierge && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />}
    </button>
  )
}
