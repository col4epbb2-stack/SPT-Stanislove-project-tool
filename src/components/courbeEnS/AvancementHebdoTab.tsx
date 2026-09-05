import { useMemo, useState } from 'react'
import type { ActiviteCourbe, VueCourbe } from '../../types/courbeEnS'
import { VUE_COURBE_LABELS, VUES_COURBE } from '../../types/courbeEnS'
import {
  avancementPlanifie,
  avancementProjet,
  avancementProjetRealise,
  avancementReleve,
  calculsActivite,
  numeroSemaine,
} from '../../lib/courbeEnSEngine'
import { formatDate, formatPercent } from '../../lib/format'
import { Onglets } from '../ui/Onglets'
import type { ActivitesParVue } from './useCourbeEnS'

// Onglet « Avancement hebdo » — un bloc de la feuille « Data courbe en S » :
// les colonnes hebdomadaires du projet, activité par activité, et la ligne
// « % » qui en fait la moyenne pondérée (SOMMEPROD de la pondération par phase
// et de la colonne).
//
// C'est la vue qui rend le calcul vérifiable : on y voit d'où sort chaque
// point de la courbe. Les cellules des vues Baseline et Forecast sont
// produites par le gabarit, celles de la vue Réalisé sont les relevés saisis
// (une case vide y reste vide — non pointée, pas 0 %).

/** Densité de couleur proportionnelle à l'avancement : à 53 colonnes, l'œil
 * lit la progression bien avant de lire les nombres. */
function fond(valeur: number | null): string {
  if (valeur === null) return ''
  if (valeur >= 1) return 'bg-emerald-100 text-emerald-800'
  if (valeur >= 0.66) return 'bg-emerald-50'
  if (valeur >= 0.33) return 'bg-amber-50'
  if (valeur > 0) return 'bg-amber-50/50'
  return ''
}

export function AvancementHebdoTab({
  activites,
  semaines,
}: {
  activites: ActivitesParVue
  semaines: string[]
}) {
  const [vue, setVue] = useState<VueCourbe>('baseline')

  const lignes = useMemo(() => [...activites[vue]].sort((a, b) => a.ordre - b.ordre), [activites, vue])

  const valeur = (activite: ActiviteCourbe, semaine: string): number | null =>
    vue === 'realise' ? avancementReleve(activite, semaine) : avancementPlanifie(activite, semaine)

  const total = (semaine: string): number | null =>
    vue === 'realise' ? avancementProjetRealise(lignes, semaine) : avancementProjet(lignes, semaine)

  return (
    <div className="space-y-3">
      <Onglets
        ariaLabel="Feuilles d'activités"
        onglets={VUES_COURBE.map((v) => ({ key: v, label: VUE_COURBE_LABELS[v] }))}
        actif={vue}
        onChange={setVue}
      />

      <p className="text-xs text-gray-400">
        {lignes.length} activité(s) · {semaines.length} semaines. La ligne « % projet » est le point que reprend la
        courbe de progression.
      </p>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-gray-500 border-b border-gray-200 min-w-56">
                Période
              </th>
              <th className="bg-white px-2 py-2 text-right font-medium text-gray-500 border-b border-gray-200 whitespace-nowrap">
                Pondération
              </th>
              {semaines.map((s) => (
                <th
                  key={s}
                  className="px-2 py-2 text-right font-medium text-gray-500 border-b border-gray-200 whitespace-nowrap"
                >
                  {formatDate(s)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-1 text-left font-medium text-gray-400 border-b border-gray-200">
                Semaine
              </th>
              <th className="bg-white border-b border-gray-200" />
              {semaines.map((s) => (
                <th key={s} className="px-2 py-1 text-right font-normal text-gray-400 border-b border-gray-200">
                  {numeroSemaine(s)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-primary/5 px-3 py-2 text-left font-semibold text-primary border-b border-gray-200">
                % projet
              </th>
              <th className="bg-primary/5 border-b border-gray-200" />
              {semaines.map((s) => {
                const t = total(s)
                return (
                  <td
                    key={s}
                    className="bg-primary/5 px-2 py-2 text-right font-semibold text-primary tabular-nums border-b border-gray-200"
                  >
                    {t === null ? '—' : formatPercent(t)}
                  </td>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {lignes.map((a) => {
              const ponderation = calculsActivite(a, lignes).ponderationParPhase
              return (
                <tr key={a.id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-gray-100 whitespace-nowrap">
                    <span className="text-gray-400 mr-1.5">{a.ordre}</span>
                    <span className="text-gray-800">{a.activite ?? '—'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums border-b border-gray-100">
                    {formatPercent(ponderation, 2)}
                  </td>
                  {semaines.map((s) => {
                    const v = valeur(a, s)
                    return (
                      <td
                        key={s}
                        className={`px-2 py-1.5 text-right tabular-nums border-b border-gray-100 ${fond(v)}`}
                      >
                        {v === null ? '' : formatPercent(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={semaines.length + 2} className="px-5 py-8 text-center text-gray-400">
                  Ce projet n'a pas d'activité dans la feuille {VUE_COURBE_LABELS[vue]}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
