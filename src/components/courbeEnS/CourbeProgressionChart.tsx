import { useState } from 'react'
import type { PointProgression } from '../../types/courbeEnS'
import { formatDate, formatPercent } from '../../lib/format'

// Le graphique de la feuille « Progress_Curve », reproduit tel qu'il est dans
// `KPI_ICP_30062026 -.xlsm` (22/08/2026, demande explicite « regarde la
// feuille Progress_Curve dans le fichier, reproduis la présentation
// fidèlement »). Relevé dans `xl/charts/chart17.xml`, le graphique du projet
// de référence :
//
//   3 séries en courbes, dans l'ordre Baseline · Réalisé · Forecast
//   couleurs du thème Office : accent2 (orange), accent1 (bleu), accent3 (gris)
//   `smooth val="0"` et `symbol val="none"` : segments droits, aucun marqueur
//   trait de 22 225 EMU, soit 1,75 pt
//   légende en haut (`legendPos val="t"`)
//   axe des valeurs : 0 → 1,2 au format `0%`
//   axe des dates : une graduation par période, étiquettes à -90°, format date
//   **aucun quadrillage** (ni `majorGridlines` sur l'axe des valeurs, ni sur
//   celui des dates)
//   étiquettes de données sur la **seule** série Réalisé (`showVal val="1"`)
//
// SVG écrit à la main : le projet n'embarque aucune bibliothèque de
// graphiques, et 3 séries sur un axe régulier ne justifient pas d'en ajouter
// une.
//
// L'histogramme « Monthly effort % » qui accompagnait ce tracé a été retiré :
// le classeur ne le trace nulle part — aucun de ses 103 graphiques ne lit les
// colonnes K/L/M. Ces trois colonnes existent dans **le tableau** de la
// feuille, et c'est là qu'elles restent.

const WIDTH = 900
const HEIGHT = 380
// Bas généreux : les étiquettes de dates sont verticales, comme dans le
// classeur.
const PAD = { top: 16, right: 24, bottom: 74, left: 48 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

/** Palette du thème Office, celle des séries du classeur. */
const SERIES = [
  { cle: 'baseline' as const, label: 'Baseline', couleur: '#ED7D31', etiquettes: false },
  { cle: 'realise' as const, label: 'Réalisé', couleur: '#4472C4', etiquettes: true },
  { cle: 'forecast' as const, label: 'Forecast', couleur: '#A5A5A5', etiquettes: false },
]

/** Axe des valeurs du classeur : `min 0`, `max 1.2`, format `0%`. */
const Y_MAX = 1.2
const Y_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2]

function x(i: number, n: number): number {
  return n <= 1 ? PAD.left : PAD.left + (i / (n - 1)) * PLOT_W
}

function y(v: number): number {
  return PAD.top + PLOT_H - (Math.min(Y_MAX, Math.max(0, v)) / Y_MAX) * PLOT_H
}

type CleSerie = 'baseline' | 'forecast' | 'realise'

/** Une série peut s'interrompre (Réalisé non pointé) : on trace chaque tronçon
 * continu séparément plutôt qu'une ligne qui joindrait par-dessus le trou.
 * Le classeur, lui, rend #N/A sur ces périodes — le trait s'y arrête aussi.
 *
 * Les relevés **isolés** sortent à part : un seul point ne fait pas un
 * segment, et le classeur ne tranche pas ce cas (ses 13 graphiques n'ont
 * jamais de relevé seul). Sans marqueur, une première semaine pointée serait
 * invisible — c'est pourtant l'état de toute fiche qui commence.
 */
function troncons(points: PointProgression[], cle: CleSerie): { chemins: string[]; isoles: number[] } {
  const chemins: string[] = []
  const isoles: number[] = []
  let courant: string[] = []
  let debut = 0
  const fermer = () => {
    if (courant.length > 1) chemins.push(courant.join(' '))
    else if (courant.length === 1) isoles.push(debut)
    courant = []
  }
  points.forEach((p, i) => {
    const v = p[cle]
    if (v === null) {
      fermer()
      return
    }
    if (courant.length === 0) debut = i
    courant.push(`${courant.length === 0 ? 'M' : 'L'}${x(i, points.length).toFixed(1)} ${y(v).toFixed(1)}`)
  })
  fermer()
  return { chemins, isoles }
}

/**
 * Deux séries qui portent exactement les mêmes valeurs sur toute la fenêtre.
 *
 * Le cas est courant dans l'application et absent du classeur : tant qu'aucune
 * date n'a été révisée, le **Forecast est la Baseline** (il en hérite tout sauf
 * ses dates). Tracées l'une par-dessus l'autre en trait plein, la dernière
 * dessinée efface la première — l'écran donnait alors une seule courbe grise,
 * et ni la Baseline ni le Réalisé n'apparaissaient.
 */
function memeSerie(points: PointProgression[], a: CleSerie, b: CleSerie): boolean {
  return points.every((p) => {
    const va = p[a]
    const vb = p[b]
    if (va === null || vb === null) return va === vb
    return Math.abs(va - vb) < 1e-9
  })
}

export function CourbeProgressionChart({ points }: { points: PointProgression[] }) {
  const [survol, setSurvol] = useState<number | null>(null)

  if (points.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">Aucune activité datée : la courbe ne peut pas être tracée.</p>
  }

  const n = points.length
  const pointSurvol = survol === null ? null : points[survol]
  // Une série confondue avec une précédente est tracée en pointillé, pour que
  // celle du dessous reste visible — et la légende le dit, sinon on croirait
  // à une courbe manquante.
  const confondueAvec: Partial<Record<CleSerie, string>> = {}
  SERIES.forEach((s, i) => {
    const precedente = SERIES.slice(0, i).find((autre) => memeSerie(points, s.cle, autre.cle))
    if (precedente) confondueAvec[s.cle] = precedente.label
  })
  // Au-delà d'une trentaine de périodes (le mode « toutes les semaines de
  // l'axe »), une étiquette sur deux : les blocs du classeur n'en comptent
  // jamais plus de 30, il ne tranche donc pas ce cas.
  const pasEtiquette = n > 30 ? 2 : 1

  return (
    <div className="space-y-2">
      {/* Légende en haut, comme `legendPos val="t"`. */}
      <div className="flex flex-wrap items-center justify-center gap-6 text-xs">
        {SERIES.map((s) => (
          <span key={s.cle} className="inline-flex items-center gap-1.5 text-gray-700">
            <svg width="20" height="8" aria-hidden>
              <line
                x1="0"
                y1="4"
                x2="20"
                y2="4"
                stroke={s.couleur}
                strokeWidth="2.5"
                strokeDasharray={confondueAvec[s.cle] ? '5 3' : undefined}
              />
            </svg>
            {s.label}
            {confondueAvec[s.cle] && (
              <span className="text-gray-400">— confondu avec {confondueAvec[s.cle]}</span>
            )}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full min-w-[640px]"
          role="img"
          aria-label="Progress curve : cumuls Baseline, Réalisé et Forecast"
          onMouseLeave={() => setSurvol(null)}
        >
          {/* Axe des valeurs : graduations et étiquettes, sans quadrillage. */}
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line x1={PAD.left - 4} y1={y(t)} x2={PAD.left} y2={y(t)} stroke="#b8bfc7" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H} stroke="#b8bfc7" strokeWidth="1" />
          <line
            x1={PAD.left}
            y1={PAD.top + PLOT_H}
            x2={WIDTH - PAD.right}
            y2={PAD.top + PLOT_H}
            stroke="#b8bfc7"
            strokeWidth="1"
          />

          {SERIES.map((s) => {
            const { chemins, isoles } = troncons(points, s.cle)
            return (
              <g key={s.cle}>
                {chemins.map((d, i) => (
                  <path
                    key={`${s.cle}-${i}`}
                    d={d}
                    fill="none"
                    stroke={s.couleur}
                    strokeWidth="2.3"
                    strokeLinejoin="round"
                    strokeDasharray={confondueAvec[s.cle] ? '7 5' : undefined}
                  />
                ))}
                {isoles.map((i) => (
                  <circle
                    key={`${s.cle}-pt-${i}`}
                    cx={x(i, n)}
                    cy={y(points[i][s.cle] ?? 0)}
                    r="3.5"
                    fill={s.couleur}
                  />
                ))}
              </g>
            )
          })}

          {/* Étiquettes de données de la série Réalisé — la seule qui en porte
              dans le classeur. */}
          {points.map((p, i) =>
            p.realise === null ? null : (
              <text
                key={`v-${p.date}`}
                x={x(i, n) + 4}
                y={y(p.realise) - 6}
                className="fill-gray-600 text-[10px] tabular-nums"
              >
                {formatPercent(p.realise, 0)}
              </text>
            )
          )}

          {survol !== null && (
            <line
              x1={x(survol, n)}
              y1={PAD.top}
              x2={x(survol, n)}
              y2={PAD.top + PLOT_H}
              stroke="#9aa5b1"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {points.map((p, i) => (
            <rect
              key={p.date}
              x={x(i, n) - PLOT_W / n / 2}
              y={PAD.top}
              width={PLOT_W / n}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setSurvol(i)}
            />
          ))}

          {/* Dates de période, verticales (rot -5400000 = -90°). */}
          {points.map((p, i) =>
            i % pasEtiquette === 0 ? (
              <text
                key={`l-${p.date}`}
                x={x(i, n)}
                y={PAD.top + PLOT_H + 8}
                textAnchor="end"
                transform={`rotate(-90 ${x(i, n)} ${PAD.top + PLOT_H + 8})`}
                className="fill-gray-500 text-[10px] tabular-nums"
              >
                {formatDate(p.date)}
              </text>
            ) : null
          )}
        </svg>
      </div>

      {pointSurvol && (
        <p className="text-xs text-gray-500 tabular-nums text-center">
          {formatDate(pointSurvol.date)} · {pointSurvol.semaine} — Baseline {formatPercent(pointSurvol.baseline, 0)}
          {pointSurvol.realise !== null && ` · Réalisé ${formatPercent(pointSurvol.realise, 0)}`}
          {pointSurvol.forecast !== null && ` · Forecast ${formatPercent(pointSurvol.forecast, 0)}`}
          {pointSurvol.delta !== null && (
            <span className={pointSurvol.delta < 0 ? 'text-red-600' : 'text-emerald-600'}>
              {' '}
              (Δ {pointSurvol.delta > 0 ? '+' : ''}
              {formatPercent(pointSurvol.delta, 2)})
            </span>
          )}
        </p>
      )}
    </div>
  )
}
