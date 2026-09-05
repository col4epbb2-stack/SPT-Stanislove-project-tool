import { lazy, Suspense, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Tache, TacheInput, VuePlanning } from '../../types/planning'
import { VUE_LABELS, VUE_DESCRIPTIONS } from '../../types/planning'
import { forecastHerite } from '../../lib/planning'
import { dernierReleve, dureeTache } from '../../types/planning'
import {
  CYCLE_BUDGET_LABELS,
  SOURCES_BUDGET_COURBE,
  coutPrevisionnel,
  tauxPour,
  type CycleBudgetId,
} from '../../types/navette'
import { useNavette } from '../../contexts/useNavette'
import { useMontant } from '../../lib/montantAffiche'
import type { Projet } from '../../types/project'
import type { NumeroCourbeType } from '../../types/courbeEnS'
import { COURBES_TYPES } from '../../data/courbeEnS/courbesTypes'
import { tachesSansGabarit } from '../../lib/courbeEnSDepuisPlanning'
import { axeSemainesPlanning } from '../../lib/courbeEnSDepuisPlanning'
import { formatDate } from '../../lib/format'
import { numeroSemaine } from '../../lib/courbeEnSEngine'
import { useProjects } from '../../contexts/useProjects'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Onglets } from '../ui/Onglets'
import { SqueletteeLignes } from '../ui/Squelette'
import { SuiviTab } from './SuiviTab'

// L'onglet « Courbe en S » de la fiche est monté ici (22/08/2026, demande
// explicite : « la présentation de la courbe dans cet onglet, mets-le dans
// l'onglet courbe en S dans le planning ») — il n'existe plus au niveau de la
// fiche. Chargé à la demande, comme il l'était depuis `ProjectDetailPage` :
// il embarque les 3 feuilles d'activités et les 5 gabarits du classeur, que
// les deux autres sous-onglets du Planning n'ont pas à traîner.
const CourbeSTab = lazy(() => import('./CourbeSTab').then((m) => ({ default: m.CourbeSTab })))

// Planning de la fiche : le tableau des tâches (3 vues Baseline / Forecast /
// Réalisé) et, depuis le 18/08/2026, le tracé de la courbe qu'il produit.
//
// Deux ajouts de cette date, demandés ensemble : la colonne « Typical
// S-curve » du tableau devient un choix parmi les **courbes types du
// paramétrage** (écran Paramètres → Courbes types, la feuille du classeur),
// et un onglet affiche la courbe que ce planning trace. Le gabarit était
// jusqu'ici affiché en lecture seule ici, et ne se choisissait que dans
// l'onglet Courbe en S — loin des dates qu'il accompagne. Cet onglet a
// lui-même rejoint le Planning le 22/08/2026 : la courbe, ses dates et son
// gabarit vivent désormais au même endroit.

interface PlanningViewProps {
  projet: Projet
}

// Les 3 sous-menus du Planning (22/08/2026, demande explicite : « lorsque
// l'utilisateur clique sur le menu Planning, il devrait retrouver les 3
// sous-menus suivants : Gestion des phases, Suivi planning, Courbe »).
//
// L'ordre est celui du document, et il porte une règle de gestion : « on
// commence toujours par créer les phases et les tâches du projet ; ce sont ces
// phases et ces tâches qui seront ensuite utilisées dans le suivi du planning ;
// le suivi ne doit donc jamais être renseigné indépendamment de la gestion des
// phases ». D'où la gestion des phases en premier **et** par défaut : elle
// était jusqu'ici un onglet frère du Planning, après lui dans la barre.
type OngletPlanning = 'phases' | 'taches' | 'courbe'

const VUES: VuePlanning[] = ['baseline', 'forecast', 'reel']
const AUTRE_PROCESSUS = '__autre__'

const dateInputClass =
  'border border-gray-200 rounded-md px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
const pctInputClass =
  'w-16 border border-gray-200 rounded-md px-1.5 py-1 text-xs text-right bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
const selectClass =
  'border border-gray-200 rounded-md px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

// Sélection du processus/phase : liste des processus déjà utilisés dans la
// baseline, + option pour en personnaliser un nouveau (retour utilisateur :
// "personnalisation du nom du processus").
function ChampProcessus({
  phasesExistantes,
  phase,
  setPhase,
}: {
  phasesExistantes: string[]
  phase: string
  setPhase: (v: string) => void
}) {
  const [personnalise, setPersonnalise] = useState(phase !== '' && !phasesExistantes.includes(phase))

  if (personnalise) {
    return (
      <div className="flex items-center gap-1.5">
        <Input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="Nom du processus" required className="w-40" />
        <button
          type="button"
          onClick={() => {
            setPersonnalise(false)
            setPhase(phasesExistantes[0] ?? '')
          }}
          className="text-xs text-gray-400 hover:text-gray-700 whitespace-nowrap"
        >
          Choisir existant
        </button>
      </div>
    )
  }

  return (
    <select
      value={phase}
      onChange={(e) => {
        if (e.target.value === AUTRE_PROCESSUS) {
          setPersonnalise(true)
          setPhase('')
        } else {
          setPhase(e.target.value)
        }
      }}
      className={selectClass}
    >
      {phasesExistantes.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
      <option value={AUTRE_PROCESSUS}>+ Nouveau processus…</option>
    </select>
  )
}

function NewTacheForm({
  projetId,
  phasesExistantes,
  onDone,
}: {
  projetId: string
  phasesExistantes: string[]
  onDone: () => void
}) {
  const { addTacheBaseline } = useProjects()
  const [phase, setPhase] = useState(phasesExistantes[0] ?? '')
  const [nom, setNom] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!phase.trim()) return
    const input: TacheInput = { phase, nom, dateDebut, dateFin }
    addTacheBaseline(projetId, input)
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 p-4 border border-gray-100 rounded-xl mb-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Processus</label>
        <ChampProcessus phasesExistantes={phasesExistantes} phase={phase} setPhase={setPhase} />
      </div>
      <Input label="Nom de la tâche" value={nom} onChange={(e) => setNom(e.target.value)} required className="w-56" />
      <Input label="Début" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} max={dateFin || undefined} required className="w-40" />
      <Input label="Fin" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} min={dateDebut || undefined} required className="w-40" />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button type="submit" size="sm">Ajouter</Button>
      </div>
    </form>
  )
}

function EditTacheRow({
  projetId,
  tache,
  phasesExistantes,
  onDone,
}: {
  projetId: string
  tache: Tache
  phasesExistantes: string[]
  onDone: () => void
}) {
  const { updateTacheBaseline } = useProjects()
  const [phase, setPhase] = useState(tache.phase)
  const [nom, setNom] = useState(tache.nom)
  const [dateDebut, setDateDebut] = useState(tache.dateDebut)
  const [dateFin, setDateFin] = useState(tache.dateFin)

  const handleSave = () => {
    if (!phase.trim() || !nom.trim()) return
    updateTacheBaseline(projetId, tache.id, { phase, nom, dateDebut, dateFin })
    onDone()
  }

  return (
    <tr className="bg-primary/5">
      <td className="px-3 py-2" colSpan={2}>
        <div className="flex flex-wrap items-end gap-2">
          <ChampProcessus phasesExistantes={phasesExistantes} phase={phase} setPhase={setPhase} />
          <Input value={nom} onChange={(e) => setNom(e.target.value)} className="w-48" />
        </div>
      </td>
      <td className="px-3 py-2" colSpan={5} />
      <td className="px-3 py-2 whitespace-nowrap">
        <input type="date" value={dateDebut} max={dateFin} onChange={(e) => setDateDebut(e.target.value)} className={dateInputClass} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <input type="date" value={dateFin} min={dateDebut} onChange={(e) => setDateFin(e.target.value)} className={dateInputClass} />
      </td>
      <td className="px-3 py-2" colSpan={8} />
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave}>Enregistrer</Button>
          <Button size="sm" variant="ghost" onClick={onDone}>Annuler</Button>
        </div>
      </td>
    </tr>
  )
}

export function PlanningView({ projet }: PlanningViewProps) {
  const {
    updateForecastTacheDates,
    saisirAvancementHebdo,
    removeTacheBaseline,
    definirGabaritTache,
    definirGabaritToutesTaches,
    definirSourceBudgetCourbe,
  } = useProjects()
  const { lignes: lignesNavette, tauxChange } = useNavette()
  const { montant: formatMontant } = useMontant()
  const projetId = projet.id
  const planning = projet.planning
  const [onglet, setOnglet] = useState<OngletPlanning>('phases')
  const [gabaritGroupe, setGabaritGroupe] = useState('')
  const [vue, setVue] = useState<VuePlanning>('reel')
  // Semaine dans laquelle on pointe (vue Réalisé) : le classeur fait saisir le
  // relevé dans la cellule de sa semaine, sur 53 colonnes. Les reproduire
  // toutes rendrait le tableau illisible — on choisit la colonne, et la
  // saisie de chaque ligne s'y rapporte. Par défaut : la semaine du jour.
  const [semainePointee, setSemainePointee] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editionId, setEditionId] = useState<string | null>(null)
  // La vue Forecast n'a que ses dates à elle : tout le reste (phase, nom,
  // courbe type, budget, pondérations…) est repris de la Baseline à la lecture
  // — le document en fait une règle, « tout le reste doit être verrouillé ou
  // automatiquement repris depuis la Baseline » (22/08/2026).
  const taches = vue === 'forecast' ? forecastHerite(planning) : planning[vue]
  // Seul le Forecast a des dates saisissables (22/08/2026, demande explicite :
  // « Réalisé : la seule information à renseigner ici c'est le pourcentage
  // réel »). La Baseline se modifie par sa ligne d'édition, et le Réalisé
  // affiche désormais les dates prévues sans permettre de les corriger — un
  // écart de délai se lit dans le Forecast, qui est fait pour ça.
  //
  // `updateReelTacheDates` reste exposé par le contexte : plus appelé nulle
  // part, mais l'écriture existe si la saisie des dates réelles revient.
  const datesEditables = vue === 'forecast'
  const updateDates = updateForecastTacheDates
  const estBaseline = vue === 'baseline'

  const phasesExistantes = [...new Set(planning.baseline.map((t) => t.phase))]
  const sansGabarit = tachesSansGabarit(planning)

  // Colonnes calculées de la feuille Baseline (22/08/2026, doc/PROJET.docx :
  // « en dehors du budget, de la date de début, de la date de fin et du type
  // de S-curve, toutes les autres colonnes doivent être calculées
  // automatiquement par l'application »). Relevées dans
  // `KPI_ICP_30062026 -.xlsm`, feuille « Projet_Baseline Actualisé » :
  //
  //   Duation (d)          = End − Start + 1
  //   Pondération          = durée / SOMME(durées de la feuille)
  //   Pondération/phase    = durée / SOMME.SI(même projet ; durées)
  //   BU / Phase           = Budget × Pondération
  //
  // La feuille du classeur mélange plusieurs projets : ses deux colonnes de
  // pondération diffèrent donc. Le planning d'une fiche ne porte **qu'un
  // projet** — les deux y sont égales, et le document tranche ce cas :
  // « si un seul projet est sélectionné : utiliser la pondération par phase
  // (colonne V) ». Une seule colonne est donc affichée.
  const totalDurees = taches.reduce((total, t) => total + dureeTache(t), 0)

  // Grille de saisie du Réalisé : les 53 semaines de l'axe, celle du jour
  // proposée d'emblée (à défaut, la dernière de l'axe — un projet terminé se
  // pointe encore).
  const semainesAxe = axeSemainesPlanning(planning)
  const aujourdHui = new Date().toISOString().slice(0, 10)
  const semaineDuJour =
    [...semainesAxe].reverse().find((semaine) => semaine <= aujourdHui) ?? semainesAxe[0] ?? ''
  const semaine = semainePointee || semaineDuJour

  // Budget du projet : le `XLOOKUP(Projet ; Coût[PROJET] ; Coût[CP PDC 02])`
  // de la colonne Budget, rendu paramétrable. Il est lu sur la ou les lignes
  // navette rattachées à la fiche, jamais saisi — et c'est le **coût
  // prévisionnel** du cycle (services + consommables), la colonne « CP … » du
  // classeur, pas le total des cinq postes.
  const sourceBudget: CycleBudgetId = projet.sourceBudgetCourbe ?? 'BU'
  const lignesDuProjet = lignesNavette.filter((l) => l.projetId === projetId)
  const budgetProjet = lignesDuProjet.length
    ? lignesDuProjet.reduce(
        (total, l) => total + coutPrevisionnel(l.cycles[sourceBudget]) * tauxPour(l.devise, tauxChange),
        0
      )
    : null

  const handleRemove = (tache: Tache) => {
    if (window.confirm(`Supprimer la tâche "${tache.nom}" ? Elle sera aussi retirée du forecast et du réalisé.`)) {
      removeTacheBaseline(projetId, tache.id)
    }
  }

  return (
    <div className="space-y-4">
      <Onglets
        ariaLabel="Sections du planning"
        onglets={[
          { key: 'phases' as const, label: 'Gestion des phases', compteur: projet.suiviPhases.length },
          { key: 'taches' as const, label: 'Suivi du planning', compteur: planning.baseline.length },
          { key: 'courbe' as const, label: 'Courbe' },
        ]}
        actif={onglet}
        onChange={setOnglet}
      />

      {onglet === 'phases' ? (
        <SuiviTab projet={projet} />
      ) : onglet === 'courbe' ? (
        <Suspense fallback={<SqueletteeLignes lignes={6} />}>
          <CourbeSTab projet={projet} />
        </Suspense>
      ) : (
        <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
              {VUES.map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setVue(v)
                    setShowForm(false)
                    setEditionId(null)
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    vue === v ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {VUE_LABELS[v]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">{VUE_DESCRIPTIONS[vue]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Poser la même courbe type sur toutes les tâches d'un coup :
                seule chose que la colonne du tableau ne sait pas faire, et
                qui existait dans l'éditeur de gabarits de l'onglet Courbe en
                S avant qu'il ne soit remplacé par cette colonne. */}
            {planning.baseline.length > 0 && (
              <>
                <select
                  value={gabaritGroupe}
                  onChange={(e) => setGabaritGroupe(e.target.value)}
                  className={selectClass}
                  aria-label="Courbe type à appliquer à toutes les tâches"
                >
                  <option value="">Courbe type pour toutes…</option>
                  {COURBES_TYPES.map((c) => (
                    <option key={c.numero} value={String(c.numero)}>
                      {c.numero} — {c.nom}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!gabaritGroupe}
                  onClick={() => definirGabaritToutesTaches(projetId, Number(gabaritGroupe) as NumeroCourbeType)}
                >
                  Appliquer
                </Button>
              </>
            )}
            {vue === 'reel' && semainesAxe.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Pointage de la semaine
                <select
                  className={selectClass}
                  value={semaine}
                  onChange={(e) => setSemainePointee(e.target.value)}
                >
                  {semainesAxe.map((s) => (
                    <option key={s} value={s}>
                      {numeroSemaine(s)} — {formatDate(s)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* Source du budget (22/08/2026) : « l'utilisateur doit pouvoir
                choisir la source du budget parmi : budget initial du projet,
                budget issu des différentes PDC associées au projet. Une fois
                la source sélectionnée, l'outil récupère automatiquement le
                montant correspondant ». Le montant n'est plus saisi nulle
                part : il vient de la ligne navette rattachée. */}
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Budget
              <select
                className={selectClass}
                value={sourceBudget}
                onChange={(e) => definirSourceBudgetCourbe(projetId, e.target.value as CycleBudgetId)}
              >
                {SOURCES_BUDGET_COURBE.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {CYCLE_BUDGET_LABELS[cycle]}
                  </option>
                ))}
              </select>
              <span className={budgetProjet == null ? 'text-amber-600' : 'text-gray-900 font-medium'}>
                {budgetProjet != null ? formatMontant(budgetProjet, 'KUSD') : 'aucune ligne navette'}
              </span>
            </label>
            {estBaseline && !showForm && (
              <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" />
                Ajouter une tâche
              </button>
            )}
          </div>
        </div>

        {estBaseline && showForm && (
          <NewTacheForm projetId={projetId} phasesExistantes={phasesExistantes} onDone={() => setShowForm(false)} />
        )}

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Phase</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Activity Name / Sous-phase</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Types AVIS/DDM/SOR</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Classification</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Champs</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Plateformes</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Services</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Start</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">End</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Duration (d)</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Typical S-curve</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Tests</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Budget</th>
                  {/* Une seule colonne de pondération : le planning d'une fiche
                      ne porte qu'un projet, où « Pondération » et « Pondération
                      par phase » sont le même nombre. « N° Ordre » a disparu —
                      le document la donne pour ce qu'elle est, « une solution
                      de contournement propre à Excel » pour retrouver ses
                      lignes quand plusieurs projets partageaient un fichier. */}
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Pondération par phase</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">BU / Phase</th>
                  {vue === 'reel' && <th className="px-3 py-2 font-medium whitespace-nowrap">Code phase</th>}
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                    {vue === 'reel' ? 'Relevé de la semaine · %' : '%'}
                  </th>
                  {estBaseline && <th className="px-3 py-2 font-medium whitespace-nowrap"> </th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {taches.map((tache) =>
                  estBaseline && editionId === tache.id ? (
                    <EditTacheRow
                      key={tache.id}
                      projetId={projetId}
                      tache={tache}
                      phasesExistantes={phasesExistantes}
                      onDone={() => setEditionId(null)}
                    />
                  ) : (
                    <tr key={tache.id}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-xs font-semibold text-primary">{tache.phase}</span>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{tache.nom}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tache.type ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tache.classification ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tache.champ ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tache.plateforme ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tache.service ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {datesEditables ? (
                          <input
                            type="date"
                            value={tache.dateDebut}
                            max={tache.dateFin}
                            onChange={(e) => updateDates(projetId, tache.id, e.target.value, tache.dateFin)}
                            className={dateInputClass}
                          />
                        ) : (
                          formatDate(tache.dateDebut)
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {datesEditables ? (
                          <input
                            type="date"
                            value={tache.dateFin}
                            min={tache.dateDebut}
                            onChange={(e) => updateDates(projetId, tache.id, tache.dateDebut, e.target.value)}
                            className={dateInputClass}
                          />
                        ) : (
                          formatDate(tache.dateFin)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{dureeTache(tache)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {/* Le gabarit est une propriété de la tâche, pas de la
                            vue : `definirGabaritTache` l'écrit sur les 3 à la
                            fois, il est donc modifiable depuis n'importe
                            laquelle. */}
                        <select
                          value={tache.typicalSCurve ? String(tache.typicalSCurve) : ''}
                          onChange={(e) =>
                            definirGabaritTache(
                              projetId,
                              tache.id,
                              e.target.value ? (Number(e.target.value) as NumeroCourbeType) : null
                            )
                          }
                          className={`${selectClass} ${tache.typicalSCurve == null ? 'text-amber-700 border-amber-200 bg-amber-50' : ''}`}
                          aria-label={`Courbe type de la tâche ${tache.nom}`}
                        >
                          <option value="">— défaut : Type 4 —</option>
                          {COURBES_TYPES.map((c) => (
                            <option key={c.numero} value={String(c.numero)}>
                              {c.numero} — {c.nom}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tache.tests ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                        {budgetProjet != null ? formatMontant(budgetProjet, 'KUSD') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                        {pct(totalDurees ? dureeTache(tache) / totalDurees : null)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                        {budgetProjet != null && totalDurees
                          ? formatMontant((budgetProjet * dureeTache(tache)) / totalDurees, 'KUSD')
                          : '—'}
                      </td>
                      {vue === 'reel' && <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tache.codePhase ?? '—'}</td>}
                      <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {vue === 'reel' ? (
                          <div className="inline-flex items-center gap-1">
                            {/* Le relevé de la semaine choisie, et non
                                l'avancement de la tâche : celui-ci est la
                                colonne « % » du classeur, le dernier relevé
                                non vide — affiché à droite, jamais saisi.
                                Vider le champ efface le relevé de la semaine,
                                il ne le met pas à zéro. */}
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={tache.realiseHebdo?.[semaine] ?? ''}
                              disabled={!semaine}
                              onChange={(e) =>
                                saisirAvancementHebdo(
                                  projetId,
                                  tache.id,
                                  semaine,
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className={pctInputClass}
                              aria-label={`Avancement de ${tache.nom} pour la semaine du ${semaine}`}
                            />
                            <span className="text-gray-400 font-normal">
                              {dernierReleve(tache.realiseHebdo) ?? tache.avancement}%
                            </span>
                          </div>
                        ) : (
                          `${tache.avancement}%`
                        )}
                      </td>
                      {estBaseline && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditionId(tache.id)} title="Modifier" className="text-gray-400 hover:text-primary">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleRemove(tache)} title="Supprimer" className="text-gray-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                )}
                {taches.length === 0 && (
                  <tr>
                    <td colSpan={vue === 'reel' ? 17 : estBaseline ? 17 : 16} className="px-5 py-8 text-center text-gray-400">
                      Aucune tâche pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {sansGabarit.length > 0 && (
          <p className="text-xs text-amber-700">
            {sansGabarit.length} tâche(s) sans courbe type choisie : le tracé leur applique le Type 4 — Construction
            (EPC), la valeur par défaut. Choisissez-en une si leur profil d'avancement diffère ; les 5 courbes types
            viennent de l'écran Paramètres.
          </p>
        )}
        </>
      )}
    </div>
  )
}
