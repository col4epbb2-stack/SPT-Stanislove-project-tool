import { Check } from 'lucide-react'
import type { Projet } from '../../types/project'
import { ETAT_COLORS } from '../../types/project'
import { phasesPresentes, couleurPhase, phasesBloquees } from '../../types/suivi'
import { avancementPlanning } from '../../types/planning'

interface PhaseEtatDiagramProps {
  projet: Projet
}

export function PhaseEtatDiagram({ projet }: PhaseEtatDiagramProps) {
  const phases = phasesPresentes(projet.planning.reel)
  // Le rouge vient du point bloquant de la phase — un seul par phase, saisi
  // dans la modale « Renseigner le suivi » (18/08/2026).
  const bloquees = phasesBloquees(projet)

  return (
    <div className="flex items-center">
      {phases.map((phase, index) => {
        const taches = projet.planning.reel.filter((t) => t.phase === phase)
        const avancement = avancementPlanning(taches)
        const etat = couleurPhase(avancement, bloquees.includes(phase))
        const colors = ETAT_COLORS[etat]

        return (
          <div key={phase} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${colors.bg}`}>
                {avancement >= 100 ? (
                  <Check className={`w-4 h-4 ${colors.text}`} />
                ) : (
                  <span className={`text-xs font-bold ${colors.text}`}>{avancement}%</span>
                )}
              </div>
              <span className="text-xs text-gray-600 text-center max-w-20">{phase}</span>
            </div>
            {index < phases.length - 1 && <div className={`h-0.5 flex-1 mx-1 ${colors.dot}`} />}
          </div>
        )
      })}
    </div>
  )
}
