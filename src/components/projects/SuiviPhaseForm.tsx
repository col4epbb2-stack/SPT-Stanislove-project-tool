import { useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, OctagonAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { EnteteSection } from '../ui/ChampsSaisie'
import { aujourdHui } from '../../lib/saisie'
import { formatDate } from '../../lib/format'
import { estRenseigne, pointBloquantDePhase } from '../../types/suivi'
import type { PointBloquant, PointBloquantProjet, SuiviPhase } from '../../types/suivi'

// Renseignement du suivi d'une phase — le point bloquant, et lui seul
// (18/08/2026, demande explicite « le point bloquant sera affiché dans la
// modale de renseignement du suivi, le reste des sections sera remplacé »).
//
// La modale portait quatre étapes en texte libre (points bloquants, points
// critiques, contraintes, décisions en attente) : 6 zones de texte par phase,
// dont personne ne pouvait dire au premier coup d'œil laquelle arrêtait
// vraiment le chantier. Une phase déclare désormais un blocage, ou aucun.
// La flèche de suivi a disparu avec les étapes : une section unique n'a pas
// de parcours.
//
// Les textes des anciennes sections ne sont pas effacés (cf. types/suivi.ts) :
// ils restent dans la donnée, simplement plus affichés ni modifiables.

const textareaClass =
  'w-full px-3 py-2 rounded-lg border text-sm bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition min-h-24'

export function SuiviPhaseForm({
  projet,
  suivi,
  isOpen,
  onClose,
  onSubmit,
}: {
  /** Nécessaire pour reprendre un point saisi sous un modèle précédent. */
  projet: { pointBloquant?: PointBloquantProjet | null }
  suivi: SuiviPhase | null
  isOpen: boolean
  onClose: () => void
  onSubmit: (valeurs: SuiviPhase) => void
}) {
  const actuel = suivi ? pointBloquantDePhase(projet, suivi) : null
  const [description, setDescription] = useState('')
  const [mitigation, setMitigation] = useState('')

  // Pré-remplissage à l'ouverture ajusté pendant le rendu plutôt que dans un
  // useEffect (même pattern que les autres formulaires du projet).
  const [cleAppliquee, setCleAppliquee] = useState<string | null>(null)
  const cleCourante = isOpen && suivi ? suivi.phase : null
  if (cleCourante !== null && cleCourante !== cleAppliquee) {
    setCleAppliquee(cleCourante)
    setDescription(actuel?.point.description ?? '')
    setMitigation(actuel?.point.mitigation ?? '')
  } else if (cleCourante === null && cleAppliquee !== null) {
    setCleAppliquee(null)
  }

  if (!isOpen || !suivi) return null

  const enregistrer = (declare: boolean) => {
    const point: PointBloquant | null = declare
      ? {
          description: description.trim(),
          mitigation: mitigation.trim(),
          // La date de déclaration est celle du premier enregistrement :
          // revenir compléter la mitigation ne fait pas rajeunir le blocage.
          declareLe: actuel && !actuel.herite ? actuel.point.declareLe : aujourdHui(),
        }
      : null
    onSubmit({ ...suivi, pointBloquant: declare && estRenseigne(description) ? point : null })
    onClose()
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    enregistrer(true)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Suivi de la phase « ${suivi.phase} »`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <EnteteSection
          titre="Point bloquant"
          aide="Ce qui empêche cette phase d'avancer aujourd'hui — un seul par phase. Une phase qui en déclare un passe au rouge dans le diagramme d'état."
        />

        {actuel?.herite && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Point repris d'une saisie antérieure. Enregistrez pour le confirmer sur cette phase.
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ce qui bloque la phase</label>
          <textarea className={textareaClass} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
          <p className="text-xs text-gray-400 mt-1">
            Laisser vide pour déclarer qu'aucun blocage ne pèse sur cette phase.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Mitigation</label>
          <textarea className={textareaClass} value={mitigation} onChange={(e) => setMitigation(e.target.value)} />
          {estRenseigne(description) && !estRenseigne(mitigation) && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-1.5">
              Un blocage est déclaré sans mitigation. Vous pouvez enregistrer quand même, la phase restera signalée
              comme incomplète.
            </p>
          )}
        </div>

        {actuel && !actuel.herite && actuel.point.declareLe && (
          <p className="text-xs text-gray-400 inline-flex items-center gap-1.5">
            <OctagonAlert className="w-3.5 h-3.5" />
            Blocage déclaré le {formatDate(actuel.point.declareLe)}.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100">
          {actuel ? (
            <button
              type="button"
              onClick={() => enregistrer(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Déclarer le blocage levé
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm">
              Enregistrer
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
