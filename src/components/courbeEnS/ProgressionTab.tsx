import { useMemo, useState } from 'react'
import { CalendarClock, Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import type { PointProgression } from '../../types/courbeEnS'
import { courbeProgression, fenetreProjet, syntheseProgression } from '../../lib/courbeEnSEngine'
import { formatDate, formatNombre, formatPercent } from '../../lib/format'
import { TuileKpi } from '../ui/TuileKpi'
import { TableauColonnes, type ColonneTableau, type GroupeColonnes } from '../ui/TableauColonnes'
import { CourbeProgressionChart } from './CourbeProgressionChart'
import type { ActivitesParVue } from './useCourbeEnS'

// Onglet « Progress curve » — la feuille du même nom, pour la fiche projet
// ouverte : bandeau (prévisionnel, réalisé, retard, jours restants),
// graphique, puis le tableau des périodes.
//
// Le classeur fige un bloc par projet les uns sous les autres ; ici tout est
// recalculé pour le projet de la fiche — c'est l'intérêt d'avoir porté les
// formules plutôt que d'en avoir repris les valeurs.

/**
 * Fin du mois d'une période — la colonne « Date de Cut-Off » de la feuille,
 * au format `mmm yy` (« févr. 26 »). Elle dit à quel arrêté mensuel la semaine
 * se rattache. Le classeur la saisit à la main, et s'y trompe : ses lignes de
 * mars 2026 portent « 2023-03-30 ». Elle est calculée ici.
 */
function dateCutOff(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  const fin = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  return fin.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

// Les colonnes de la feuille, dans son ordre et avec ses formats de nombre :
//
//   B  Période            date
//   C  Semaine            S5, S6…
//   D  Date de Cut-Off    mmm yy
//   F  Baseline    0%     ┐
//   G  Réalisé     0%     │ « Cumulative % »
//   H  Forecast    0%     │
//   I  Delta       0.00%  ┘
//   K  planned     0.00%  ┐
//   L  forecast    0.0%   │ « Monthly effort  % »
//   M  actual      0.00%  ┘
//
// L'ordre Baseline → Réalisé → Forecast est celui du classeur (F, G, H) : le
// réalisé est au milieu, entre le plan de référence et le plan révisé.
const colonnesProgression: ColonneTableau<PointProgression>[] = [
  { cle: 'date', entete: 'Période', valeur: (p) => formatDate(p.date), texte: (p) => p.date },
  { cle: 'semaine', entete: 'Semaine', valeur: (p) => p.semaine },
  { cle: 'cutoff', entete: 'Date de Cut-Off', valeur: (p) => dateCutOff(p.date) },
  {
    cle: 'baseline',
    entete: 'Baseline',
    align: 'right',
    valeur: (p) => formatPercent(p.baseline, 0),
    texte: (p) => p.baseline,
  },
  {
    cle: 'realise',
    entete: 'Réalisé',
    align: 'right',
    // Colonne en gras dans la feuille — c'est celle qu'on vient lire.
    valeur: (p) => (p.realise === null ? '—' : <span className="font-semibold">{formatPercent(p.realise, 0)}</span>),
    texte: (p) => p.realise,
  },
  {
    cle: 'forecast',
    entete: 'Forecast',
    align: 'right',
    valeur: (p) => (p.forecast === null ? '—' : formatPercent(p.forecast, 0)),
    texte: (p) => p.forecast,
  },
  {
    cle: 'delta',
    entete: 'Delta',
    align: 'right',
    valeur: (p) =>
      p.delta === null ? (
        '—'
      ) : (
        <span className={p.delta < 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
          {p.delta > 0 ? '+' : ''}
          {formatPercent(p.delta, 2)}
        </span>
      ),
    texte: (p) => p.delta,
  },
  {
    cle: 'effortBaseline',
    entete: 'planned',
    align: 'right',
    valeur: (p) => formatPercent(p.effortBaseline, 2),
    texte: (p) => p.effortBaseline,
  },
  {
    cle: 'effortForecast',
    entete: 'forecast',
    align: 'right',
    valeur: (p) =>
      p.effortForecast === null ? '—' : <span className="font-semibold">{formatPercent(p.effortForecast, 1)}</span>,
    texte: (p) => p.effortForecast,
  },
  {
    cle: 'effortRealise',
    entete: 'actual',
    align: 'right',
    valeur: (p) =>
      p.effortRealise === null ? '—' : <span className="font-semibold">{formatPercent(p.effortRealise, 2)}</span>,
    texte: (p) => p.effortRealise,
  },
]

/** Les deux intitulés qui coiffent les colonnes, comme les cellules fusionnées
 * F6:I6 et K6:M6 de la feuille. */
const groupesProgression: GroupeColonnes[] = [
  { span: 3 },
  { label: 'Cumulative %', span: 4 },
  { label: 'Monthly effort  %', span: 3 },
]

export function ProgressionTab({
  activites,
  semaines,
  nomProjet,
}: {
  activites: ActivitesParVue
  semaines: string[]
  /** Nom de la fiche projet — sert de titre aux extractions. */
  nomProjet: string
}) {
  const [toutesSemaines, setToutesSemaines] = useState(false)

  const points = useMemo(
    () => courbeProgression(activites.baseline[0]?.projet ?? '', activitesParProjet(activites), semaines),
    [activites, semaines]
  )
  const affiches = useMemo(() => (toutesSemaines ? points : fenetreProjet(points)), [points, toutesSemaines])

  const synthese = useMemo(
    () => syntheseProgression(nomProjet, points, activites.baseline),
    [nomProjet, points, activites.baseline]
  )

  const enRetard = (synthese.retard ?? 0) < 0

  return (
    <div className="space-y-4">
      {/* Le bandeau de la feuille (K2:L5), dans son ordre et avec ses
          intitulés : Jours restants · Prévisionnel · Réalisé · Retard. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <TuileKpi
          libelle="Jours restants"
          valeur={synthese.joursRestants === null ? '—' : formatNombre(synthese.joursRestants)}
          detail={
            synthese.debut && synthese.fin
              ? `${formatDate(synthese.debut)} → ${formatDate(synthese.fin)}`
              : 'Dates de projet incomplètes'
          }
          icone={<CalendarClock className="w-5 h-5" />}
          ton="gray"
        />
        <TuileKpi
          libelle="Prévisionnel"
          valeur={formatPercent(synthese.previsionnel, 0)}
          detail="Baseline au dernier pointage"
          icone={<Gauge className="w-5 h-5" />}
          progression={synthese.previsionnel}
        />
        <TuileKpi
          libelle="Réalisé"
          valeur={synthese.realise === null ? '—' : formatPercent(synthese.realise, 0)}
          detail={synthese.realise === null ? 'Aucun relevé saisi' : 'Dernier relevé hebdomadaire'}
          icone={<TrendingUp className="w-5 h-5" />}
          ton="amber"
          progression={synthese.realise ?? undefined}
        />
        {/* `=SI(M5<0;M5;0%)` : une avance n'est pas un retard, la cellule
            affiche alors 0 % — et non l'écart positif. */}
        <TuileKpi
          libelle="Retard"
          valeur={synthese.retard === null ? '—' : formatPercent(synthese.retard, 0)}
          detail={
            synthese.ecart === null
              ? 'Réalisé non renseigné'
              : enRetard
                ? `Écart au planning : ${formatPercent(synthese.ecart, 2)}`
                : `Aucun retard — écart : +${formatPercent(synthese.ecart, 2)}`
          }
          icone={enRetard ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
          ton={enRetard ? 'red' : 'emerald'}
        />
      </div>

      {/* En-tête de la feuille : « PROGRESS CURVE » et, à sa droite, le nom du
          projet (P1 et le bloc fusionné Q2:AC2). */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h5 className="text-sm font-bold tracking-wide text-gray-900">PROGRESS CURVE</h5>
          <p className="text-sm font-semibold text-gray-700">{nomProjet}</p>
        </div>
        <CourbeProgressionChart points={affiches} />
      </div>

      <div className="flex justify-end">
        <label className="inline-flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={toutesSemaines} onChange={(e) => setToutesSemaines(e.target.checked)} />
          Afficher les {semaines.length} semaines de l'axe
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <TableauColonnes
          colonnes={colonnesProgression}
          groupes={groupesProgression}
          lignes={affiches}
          cleLigne={(p) => p.date}
          messageVide="Aucune période à afficher."
          exportation={{
            nomFichier: `courbe-en-s-${nomProjet.slice(0, 30)}`,
            titre: `Progress curve — ${nomProjet}`,
            sousTitre: `${affiches.length} période(s) hebdomadaire(s)`,
            lignes: affiches,
          }}
        />
      </div>
    </div>
  )
}

/**
 * `courbeProgression` filtre par nom de projet (c'est ce que fait le
 * classeur) ; les activités reçues ici sont déjà celles de la fiche, mais
 * peuvent porter plusieurs noms différents dans le classeur si la fiche a été
 * rattachée à plusieurs. On les ramène donc à un nom unique.
 */
function activitesParProjet(activites: ActivitesParVue): ActivitesParVue {
  const nom = activites.baseline[0]?.projet ?? ''
  const uniformiser = (lignes: ActivitesParVue[keyof ActivitesParVue]) => lignes.map((a) => ({ ...a, projet: nom }))
  return {
    baseline: uniformiser(activites.baseline),
    forecast: uniformiser(activites.forecast),
    realise: uniformiser(activites.realise),
  }
}
