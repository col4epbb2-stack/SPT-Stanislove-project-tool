import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { SuiviPhaseForm } from './SuiviPhaseForm'
import { PhaseSaisieForm } from './PhaseSaisieForm'
import { formatDate } from '../../lib/format'
import type { Projet } from '../../types/project'
import { estRenseigne, pointBloquantDePhase } from '../../types/suivi'
import type { PointBloquant, SuiviPhase } from '../../types/suivi'
import { avancementPlanning } from '../../types/planning'
import { useProjects } from '../../contexts/useProjects'

// Phases et activités du projet : une carte par phase (ses activités, son
// point bloquant, son avancement repris du planning), l'ajout d'une phase
// avec ses activités, le renommage et la suppression — les phases étaient
// figées à ce que le planning contenait à la création de la fiche, et leur
// suivi tenait dans un formulaire à 4 étapes de texte libre réduit depuis le
// 18/08/2026 au seul point bloquant.

const inputClass =
  'px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

// L'état d'une phase se lit désormais à son seul point bloquant : les points
// critiques, contraintes et décisions ne sont plus saisis (18/08/2026), et
// continuer à en faire des badges figerait d'anciennes valeurs que plus
// personne ne peut mettre à jour.
function BadgesEtat({ bloquant }: { bloquant: { point: PointBloquant; herite: boolean } | null }) {
  if (!bloquant) return <Badge label="Aucun blocage" bg="bg-gray-100" text="text-gray-500" />

  return (
    <>
      <Badge label="Point bloquant" bg="bg-red-100" text="text-red-700" dot="bg-red-500" />
      {!estRenseigne(bloquant.point.mitigation) && (
        <Badge label="Mitigation manquante" bg="bg-amber-100" text="text-amber-700" />
      )}
      {bloquant.herite && <Badge label="À confirmer" bg="bg-amber-100" text="text-amber-700" />}
    </>
  )
}

function PhaseCard({
  projet,
  suivi,
  bloquant,
  onOuvrir,
  onAjouterActivites,
}: {
  projet: Projet
  suivi: SuiviPhase
  bloquant: { point: PointBloquant; herite: boolean } | null
  onOuvrir: () => void
  onAjouterActivites: () => void
}) {
  const { renommerPhaseSuivi, supprimerPhaseSuivi } = useProjects()
  const [renommage, setRenommage] = useState<string | null>(null)

  // Le nom de la phase joint le suivi aux tâches du planning : une phase qui
  // en porte encore ne peut pas être supprimée sans les laisser orphelines.
  const tachesLiees = [projet.planning.baseline, projet.planning.forecast, projet.planning.reel].reduce(
    (n, vue) => n + vue.filter((t) => t.phase === suivi.phase).length,
    0
  )
  const avancement = avancementPlanning(projet.planning.reel.filter((t) => t.phase === suivi.phase))
  const nomsExistants = projet.suiviPhases.map((s) => s.phase)
  // Les activités de la phase : la baseline fait foi (c'est elle qui les
  // crée, forecast et réalisé en reçoivent une copie de même id).
  const activites = projet.planning.baseline.filter((t) => t.phase === suivi.phase)
  const modifications = projet.modificationsScope.filter((m) => m.phase === suivi.phase)

  const validerRenommage = (e: FormEvent) => {
    e.preventDefault()
    if (renommage !== null) renommerPhaseSuivi(projet.id, suivi.phase, renommage)
    setRenommage(null)
  }

  const supprimer = () => {
    if (window.confirm(`Supprimer le suivi de la phase "${suivi.phase}" ?`)) {
      supprimerPhaseSuivi(projet.id, suivi.phase)
    }
  }

  const nomEnDoublon =
    renommage !== null && renommage.trim() !== suivi.phase && nomsExistants.includes(renommage.trim())

  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {renommage !== null ? (
            <form onSubmit={validerRenommage} className="flex items-center gap-1.5">
              <input
                autoFocus
                value={renommage}
                onChange={(e) => setRenommage(e.target.value)}
                className={inputClass}
                placeholder="Nom de la phase"
              />
              <button
                type="submit"
                disabled={!renommage.trim() || nomEnDoublon}
                title="Valider"
                className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRenommage(null)}
                title="Annuler"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-primary truncate">{suivi.phase}</p>
              <button
                onClick={() => setRenommage(suivi.phase)}
                title="Renommer la phase (le planning et les actions suivent)"
                className="p-1 rounded-lg text-gray-300 hover:text-primary hover:bg-primary/10 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {activites.length > 0
              ? `${activites.length} activité(s) · avancement réel ${avancement} %`
              : 'Aucune activité — la phase n’apparaît pas dans le diagramme d’état.'}
            {modifications.length > 0 && ` · ${modifications.length} modification(s) de scope`}
          </p>
          {nomEnDoublon && <p className="text-xs text-red-600 mt-1">Ce nom est déjà utilisé par une autre phase.</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="ghost" onClick={onAjouterActivites}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Activités
          </Button>
          <Button size="sm" variant="ghost" onClick={onOuvrir}>
            {bloquant ? 'Voir le blocage' : 'Renseigner le suivi'}
          </Button>
          <button
            onClick={supprimer}
            disabled={tachesLiees > 0}
            title={
              tachesLiees > 0
                ? `Impossible : ${tachesLiees} tâche(s) de planning portent cette phase.`
                : 'Supprimer la phase'
            }
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {activites.length > 0 && (
        <ul className="mt-3 space-y-1">
          {activites.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-gray-700 truncate">{t.nom}</span>
              <span className="text-gray-400 shrink-0 tabular-nums">
                {formatDate(t.dateDebut)} → {formatDate(t.dateFin)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {bloquant && (
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-xs space-y-1">
          <p className="text-gray-900 whitespace-pre-line">{bloquant.point.description}</p>
          <p className="text-gray-500">
            <span className="text-gray-400">Mitigation : </span>
            {estRenseigne(bloquant.point.mitigation) ? bloquant.point.mitigation : '— à renseigner'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <BadgesEtat bloquant={bloquant} />
      </div>
    </div>
  )
}

export function PhasesSuiviSection({ projet }: { projet: Projet }) {
  const { updateSuiviPhase, ajouterPhaseSuivi } = useProjects()
  const [phaseEditee, setPhaseEditee] = useState<string | null>(null)
  // `''` = création d'une phase, un nom = ajout d'activités à cette phase :
  // c'est le même formulaire (PhaseSaisieForm).
  const [saisiePhase, setSaisiePhase] = useState<string | null>(null)

  // Relu dans la fiche à chaque rendu : après enregistrement, la modale doit
  // afficher la version à jour, pas la copie prise à l'ouverture.
  const suiviOuvert = phaseEditee ? (projet.suiviPhases.find((s) => s.phase === phaseEditee) ?? null) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">Phases et activités</h4>
        <button
          onClick={() => setSaisiePhase('')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter une phase
        </button>
      </div>

      {projet.suiviPhases.length === 0 ? (
        <p className="text-sm text-gray-400">
          Aucune phase de suivi. Ajoutez-en une, ou créez des tâches dans le planning pour en faire apparaître.
        </p>
      ) : (
        <div className="space-y-3">
          {projet.suiviPhases.map((suivi) => (
            <PhaseCard
              key={suivi.phase}
              projet={projet}
              suivi={suivi}
              bloquant={pointBloquantDePhase(projet, suivi)}
              onOuvrir={() => setPhaseEditee(suivi.phase)}
              onAjouterActivites={() => setSaisiePhase(suivi.phase)}
            />
          ))}
        </div>
      )}

      {/* Remonté à chaque ouverture (clé) : sans cela, les activités tapées
          pour une phase resteraient affichées à l'ouverture suivante. */}
      <PhaseSaisieForm
        key={saisiePhase ?? 'ferme'}
        isOpen={saisiePhase !== null}
        phaseExistante={saisiePhase || undefined}
        nomsExistants={projet.suiviPhases.map((s) => s.phase)}
        onClose={() => setSaisiePhase(null)}
        onSubmit={(phase, activites) => ajouterPhaseSuivi(projet.id, phase, activites)}
      />

      <SuiviPhaseForm
        projet={projet}
        suivi={suiviOuvert}
        isOpen={!!suiviOuvert}
        onClose={() => setPhaseEditee(null)}
        onSubmit={(valeurs) => updateSuiviPhase(projet.id, valeurs)}
      />
    </div>
  )
}
