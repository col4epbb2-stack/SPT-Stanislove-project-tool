import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { libelleMois, preremplirPointage, type PropositionPointage } from '../../lib/contratEpcmEngine'
import { HEURES_PAR_JOUR_POINTE } from '../../types/contratEpcm'
import type { EmployeEpcm, PlanningMoisEpcm, PointageMoisEpcm } from '../../types/contratEpcm'

/**
 * Pré-remplissage du pointage d'un mois (§4 de `doc/EPCM.docx` : « l'objectif
 * est de réduire les saisies manuelles »).
 *
 * **Elle montre avant d'écrire**, comme la génération du planning : combien de
 * jours seront posés, combien sont déjà pointés donc conservés, et combien
 * sont écartés parce qu'ils sont en congé, repos ou absence.
 *
 * **Chaque jour posé vaut une journée** (rev01, point Pointage : « elle doit
 * simplement renseigner le chiffre 1 pour indiquer qu'elle a effectué une
 * journée de travail »). Le champ « heures par jour » a disparu avec la
 * saisie des heures : une journée vaut 12 h, et les heures se déduisent du
 * nombre de jours.
 */
export function PreremplissageModal({
  employes,
  plannings,
  pointages,
  mois,
  onClose,
  onAppliquer,
}: {
  employes: EmployeEpcm[]
  plannings: PlanningMoisEpcm[]
  pointages: PointageMoisEpcm[]
  mois: string
  onClose: () => void
  onAppliquer: (propositions: PropositionPointage[], mois: string) => Promise<void>
}) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const propositions = useMemo(
    () => preremplirPointage(employes, plannings, pointages, mois),
    [employes, plannings, pointages, mois]
  )
  const applicables = propositions.filter((p) => Object.keys(p.aPoser).length > 0)
  const total = applicables.reduce((s, p) => s + Object.keys(p.aPoser).length, 0)
  const conserves = propositions.reduce((s, p) => s + p.conserves, 0)
  const ecartes = propositions.reduce((s, p) => s + p.ecartes, 0)

  const appliquer = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      await onAppliquer(applicables, mois)
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
      setEnCours(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Pré-remplir le pointage — ${libelleMois(mois)}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Chaque jour du planning qui compte comme <strong>travaillé</strong> est posé comme présent. Les jours de{' '}
          <strong>congé, de repos et d'absence sont écartés</strong> — c'est la même table qui décide ici et dans le
          calcul des jours travaillés.
        </p>

        <p className="text-xs text-gray-500">
          Chaque jour posé vaut <strong>une journée</strong> ({HEURES_PAR_JOUR_POINTE} h). Les heures ne se saisissent
          plus : elles se déduisent du nombre de jours.
        </p>

        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-sm">
          <p className="text-gray-900">
            <strong>{total}</strong> jour(s) à poser sur <strong>{applicables.length}</strong> employé(s).
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {conserves} jour(s) déjà pointé(s), conservé(s) · {ecartes} jour(s) écarté(s) (congé, repos, absence).
          </p>
          {propositions.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Aucun planning sur ce mois : il n'y a rien à pré-remplir. Générez d'abord le planning depuis la fiche du
              personnel.
            </p>
          )}
        </div>

        {applicables.length > 0 && (
          <ul className="text-xs text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
            {applicables.map((p) => (
              <li key={p.employeId} className="flex justify-between gap-3">
                <span>{p.libelle}</span>
                <span className="text-gray-500 shrink-0">
                  {Object.keys(p.aPoser).length} jour(s)
                  {p.conserves > 0 && ` · ${p.conserves} conservé(s)`}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-gray-500 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
          Un jour déjà pointé n'est jamais réécrit. Les jours posés ici sont marqués comme pré-remplis tant qu'ils
          n'ont pas été repris à la main : un jour déduit du planning n'est pas un jour déclaré.
        </p>

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" loading={enCours} disabled={total === 0} onClick={() => void appliquer()}>
            <CalendarCheck className="w-4 h-4 mr-1.5" />
            {total === 0 ? 'Rien à poser' : `Poser ${total} jour(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
