import { useMemo, useState } from 'react'
import { LineChart } from 'lucide-react'
import type { Projet } from '../../types/project'
import type { NumeroCourbeType } from '../../types/courbeEnS'
import { useCourbeEnSProjet } from '../courbeEnS/useCourbeEnS'
import { AllureCourbes } from '../courbeEnS/AllureCourbes'
import { ProgressionTab } from '../courbeEnS/ProgressionTab'
import { Onglets } from '../ui/Onglets'
import { couleurCourbeType, courbeTypePar } from '../../lib/courbesTypes'
import { formatPercent } from '../../lib/format'

// « Courbe en S » — 3ᵉ sous-menu du Planning depuis le 22/08/2026 (demande
// explicite : « la présentation de la courbe dans cet onglet, mets-le dans
// l'onglet courbe en S dans le planning »), onglet de la fiche projet avant
// cela. Il rejoint ainsi ce dont il dépend : les dates du planning et la
// colonne « Typical S-curve » qui le nourrissent sont dans le sous-menu
// voisin. Deux vues (20/08/2026).
//
//  - **Allure** : la courbe type retenue par le projet et sa forme. C'est ce
//    que l'onglet montrait seul depuis le 18/08/2026 (demande explicite
//    « dans la section courbe en S on va afficher juste la courbe choisie et
//    son allure uniquement ») — elle reste la vue d'ouverture, rien n'en a
//    été retiré.
//  - **Progress curve** : le tracé lui-même. Ajouté d'après le document de
//    référence (« Typical S Curve »), qui décrit cette feuille comme
//    résultant des trois plannings — Baseline, Forecast, Réalisé — et servant
//    à comparer l'évolution prévisionnelle et réelle pour analyser les
//    écarts. C'est exactement la feuille `Progress_Curve` du classeur
//    KPI_ICP_2905 : trois cumulés, leur Delta et l'effort par période. Sa
//    présentation est reprise du fichier de production `KPI_ICP_30062026`
//    (22/08/2026) : bandeau à 4 valeurs, graphique aux couleurs et à l'axe du
//    classeur, puis le tableau et ses deux blocs d'en-tête.
//
// Le tracé n'est pas réécrit ici : c'est le `ProgressionTab` déjà utilisé par
// Planning › Courbe, monté sur les activités que `useCourbeEnSProjet` sert —
// les mêmes que l'allure. Deux implémentations d'une même courbe finiraient
// par diverger.
//
// L'onglet portait jusqu'ici cinq sous-onglets : la progression du projet,
// les 3 feuilles d'activités du classeur, l'avancement hebdomadaire, les 5
// courbes types et l'éditeur de gabarits. Les deux réorganisations du même
// jour les ont redistribués — le tracé du projet est passé dans Planning ›
// Courbe, les 5 courbes types dans Paramètres, et le choix du gabarit dans la
// colonne « Typical S-curve » du tableau du planning. Ne reste ici que la
// lecture : quelle courbe type ce projet a retenue, et à quoi elle ressemble.
//
// La courbe type est la **forme** que suit l'avancement d'une tâche entre son
// début et sa fin ; l'avancement du projet, lui, est la moyenne pondérée par
// les durées et se lit dans l'onglet Planning.
//
// Un seul graphique porte toutes les allures retenues, et la légende dit
// laquelle est laquelle (demande explicite : « une seule courbe avec les
// allures dessus et une légende, pas plusieurs graphiques ») — un projet dont
// les tâches ne suivent pas toutes le même modèle se lit d'un coup d'œil, ce
// qu'une carte par modèle ne permettait pas.

interface UsageCourbe {
  numero: NumeroCourbeType
  nom: string
  cumul: number[]
  /** Tâches (ou activités) du projet qui l'ont retenue. */
  taches: string[]
}

type VueCourbeEnS = 'allure' | 'progression'

export function CourbeSTab({ projet }: { projet: Projet }) {
  // Le hook sert de source unique : selon le cas, les activités viennent du
  // planning de la fiche ou du classeur KPI_ICP rattaché — le gabarit retenu
  // comme le tracé se lisent de la même façon dans les deux.
  const { chargement, source, activites, semaines } = useCourbeEnSProjet(projet.id)
  const [vue, setVue] = useState<VueCourbeEnS>('allure')

  const usages = useMemo<UsageCourbe[]>(() => {
    const parNumero = new Map<NumeroCourbeType, UsageCourbe>()
    for (const activite of activites.baseline) {
      const numero = activite.courbeType
      if (numero == null) continue
      const type = courbeTypePar(numero)
      if (!type) continue
      const usage = parNumero.get(numero) ?? { numero, nom: type.nom, cumul: type.cumul, taches: [] }
      usage.taches.push(activite.activite ?? '(sans nom)')
      parNumero.set(numero, usage)
    }
    return [...parNumero.values()].sort((a, b) => a.numero - b.numero)
  }, [activites.baseline])

  const sansCourbe = activites.baseline.filter((a) => a.courbeType == null)

  if (chargement) return <p className="text-sm text-gray-400">Chargement de la courbe en S…</p>

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-gray-900">Courbe en S</h4>
        <p className="text-xs text-gray-500 max-w-3xl mt-0.5">
          {vue === 'allure'
            ? 'La courbe type retenue par ce projet et son allure — la forme que suit l’avancement d’une tâche entre son début et sa fin. Elle se choisit dans « Suivi du planning », colonne « Typical S-curve », parmi les 5 courbes du paramétrage.'
            : 'Le tracé du projet, construit sur les trois plannings — Baseline, Forecast et Réalisé : il compare l’évolution prévisionnelle et l’évolution réelle, et c’est leur écart (colonne Delta) qui mesure l’avance ou le retard. Reproduit la feuille « Progress_Curve » du classeur KPI_ICP_2905.'}
          {source === 'classeur' && ' Ce projet lit les activités reprises du classeur KPI_ICP, pas son planning.'}
          {/* Précision qui vivait dans l'ancien « Planning › Courbe », dont
              cette vue prend la place : elle ne vaut que pour une courbe
              construite sur le planning de la fiche. */}
          {vue === 'progression' &&
            source === 'planning' &&
            ' La vue Réalisé y porte un relevé unique, daté de la semaine en cours — le planning connaît l’avancement d’aujourd’hui, pas son historique.'}
        </p>
      </div>

      <Onglets
        onglets={[
          { key: 'allure' as const, label: 'Allure' },
          { key: 'progression' as const, label: 'Progress curve' },
        ]}
        actif={vue}
        onChange={setVue}
        ariaLabel="Vues de la courbe en S"
      />

      {vue === 'progression' &&
        (activites.baseline.length === 0 ? (
          <p className="text-sm text-gray-400">
            Aucune activité : ni tâche au planning de la fiche, ni activité du classeur rattachée à ce projet. Il n'y a
            pas encore de courbe à tracer.
          </p>
        ) : (
          <ProgressionTab activites={activites} semaines={semaines} nomProjet={projet.nom} />
        ))}

      {vue === 'allure' && (usages.length === 0 ? (
        <div className="carte p-6 flex items-start gap-3">
          <LineChart className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-500">
            <p className="font-medium text-gray-700">Aucune courbe type retenue</p>
            <p className="mt-0.5">
              {activites.baseline.length === 0
                ? 'Ce projet n’a encore aucune tâche : la courbe type se choisit sur une tâche du planning.'
                : `Aucune des ${activites.baseline.length} tâche(s) du planning ne porte de courbe type choisie : le tracé leur applique le Type 4 — Construction (EPC). Une autre se choisit dans « Suivi du planning », colonne « Typical S-curve ».`}
            </p>
          </div>
        </div>
      ) : (
        <div className="carte p-4 space-y-4">
          <AllureCourbes courbes={usages} />

          {/* Légende : le trait, ce qu'il représente, ce qu'il a couvert dans
              ce projet, et trois repères de sa forme — le tout sous le
              graphique plutôt qu'en cartes séparées. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-1.5 pr-3 font-medium">Courbe type retenue</th>
                  <th className="py-1.5 px-3 font-medium">Tâches</th>
                  {[25, 50, 75].map((ut) => (
                    <th key={ut} className="py-1.5 px-3 font-medium text-right whitespace-nowrap">
                      à {ut} % du temps
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usages.map((usage) => (
                  <tr key={usage.numero}>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-4 h-1 rounded-full shrink-0"
                          style={{ backgroundColor: couleurCourbeType(usage.numero) }}
                        />
                        <span className="text-gray-900">
                          {usage.numero} — {usage.nom}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-500">
                      {usage.taches.length}
                      {usage.taches.length <= 3 && ` · ${usage.taches.join(', ')}`}
                    </td>
                    {[25, 50, 75].map((ut) => (
                      <td key={ut} className="py-2 px-3 text-right tabular-nums text-gray-700">
                        {formatPercent(usage.cumul[ut], 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {vue === 'allure' && usages.length > 0 && sansCourbe.length > 0 && (
        <p className="text-xs text-amber-700">
          {sansCourbe.length} tâche(s) n’ont pas de courbe type choisie : leur allure est celle du Type 4 —
          Construction (EPC), appliqué par défaut.
        </p>
      )}
    </div>
  )
}
