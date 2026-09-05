import { couleurCourbeType } from '../../lib/courbesTypes'
import type { NumeroCourbeType } from '../../types/courbeEnS'

// Allure des courbes types retenues par un projet : **un seul graphique**,
// toutes les allures dessus, une légende dessous (18/08/2026, demande
// explicite « le but c'est d'avoir une seule courbe avec les allures dessus et
// une légende, pas plusieurs graphiques »).
//
// Le tracé est celui du modèle choisi dans le paramétrage (feuille « typical
// S curve », écran Paramètres) : courbe sans lissage ni marqueur, axe 0-100 %,
// comme le graphique du classeur. C'est la forme que suit l'avancement d'une
// tâche entre son début et sa fin — pas l'avancement du projet, qui se lit
// dans Planning › Courbe.

export interface AllureCourbe {
  numero: NumeroCourbeType
  nom: string
  cumul: number[]
}

const W = 760
const H = 300
const PAD = { top: 14, right: 16, bottom: 26, left: 44 }
const PW = W - PAD.left - PAD.right
const PH = H - PAD.top - PAD.bottom

export function AllureCourbes({ courbes }: { courbes: AllureCourbe[] }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Allure des courbes types retenues">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.top + PH - t * PH
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#d9d9d9" />
            <text x={PAD.left - 6} y={y + 3.5} textAnchor="end" className="fill-gray-500 text-[9px]">
              {Math.round(t * 100)} %
            </text>
          </g>
        )
      })}
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((ut) => (
        <text
          key={ut}
          x={PAD.left + (ut / 100) * PW}
          y={H - 8}
          textAnchor="middle"
          className="fill-gray-500 text-[9px]"
        >
          {ut}
        </text>
      ))}
      <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-gray-400 text-[9px]">
        % du temps de la tâche
      </text>

      {courbes.map((courbe) => (
        <path
          key={courbe.numero}
          d={courbe.cumul
            .map((v, i) => {
              const x = PAD.left + (i / 100) * PW
              const y = PAD.top + PH - Math.min(1, v) * PH
              return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
            })
            .join(' ')}
          fill="none"
          stroke={couleurCourbeType(courbe.numero)}
          strokeWidth="2.5"
        />
      ))}
    </svg>
  )
}
