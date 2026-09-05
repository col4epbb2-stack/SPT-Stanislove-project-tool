import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatDate } from '../../lib/format'
import {
  AFFECTATIONS,
  cycleRotation,
  horizonPlanning,
  JOURS_CYCLE_ROTATION,
  parMois,
  propositionsAffectation,
  libelleMois,
  type PropositionPlanning,
} from '../../lib/contratEpcmEngine'
import type { EmployeEpcm, PlanningMoisEpcm } from '../../types/contratEpcm'
import { TYPE_AFFECTATION_EMPLOYE_LABELS } from '../../types/contratEpcm'

/**
 * Génération du planning prévisionnel d'une affectation (§3 de
 * `doc/EPCM.docx` : « le planning prévisionnel doit être généré
 * automatiquement dès qu'une affectation est créée »).
 *
 * **Elle montre avant d'écrire.** Poser plusieurs mois de planning est un
 * geste large : l'écran annonce combien de jours seront posés, combien sont
 * déjà planifiés et donc conservés, et pour qui — même parcours que les
 * migrations de Paramètres › Maintenance.
 *
 * Le **binôme** apparaît comme une seconde proposition, en cycle inversé
 * (§3 : « Stan 28 jours ON, Armel 28 jours OFF, puis inversion du cycle »).
 *
 * **Reprogrammation** (rev01, point 3 : « en cas d'imprévu (maladie, urgence
 * personnelle, remplacement exceptionnel, etc.), il devrait être possible de
 * modifier les dates du planning ; de reprogrammer les rotations concernées »).
 * C'est le seul geste qui **écrase** des jours déjà planifiés, donc le seul
 * qui se coche explicitement — et l'écran annonce combien de jours seront
 * remplacés **avant** d'écrire.
 */
export function GenerationPlanningModal({
  employe,
  employes,
  plannings,
  onClose,
  onAppliquer,
}: {
  employe: EmployeEpcm
  employes: EmployeEpcm[]
  plannings: PlanningMoisEpcm[]
  onClose: () => void
  onAppliquer: (propositions: PropositionPlanning[]) => Promise<void>
}) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [remplacer, setRemplacer] = useState(false)

  const propositions = useMemo(
    () => propositionsAffectation(employe, employes, plannings, remplacer),
    [employe, employes, plannings, remplacer]
  )
  const applicables = propositions.filter((p) => Object.keys(p.aPoser).length > 0)
  const total = applicables.reduce((s, p) => s + Object.keys(p.aPoser).length, 0)
  const totalRemplaces = propositions.reduce((s, p) => s + p.remplaces, 0)
  const cycle = cycleRotation(employe)
  const horizon = horizonPlanning(employe)

  const appliquer = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      await onAppliquer(applicables)
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
      setEnCours(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Générer le planning — ${employe.prenom} ${employe.nom}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {employe.typeAffectation === 'BUREAU' ? (
            <>
              Affectation <strong>{TYPE_AFFECTATION_EMPLOYE_LABELS.BUREAU}</strong> : les jours ouvrés sont posés.{' '}
              <strong>Les samedis et dimanches ne sont pas planifiés</strong> — un week-end travaillé s'ajoute à la main.
            </>
          ) : (
            <>
              Affectation en rotation : cycle{' '}
              <strong>
                {cycle ? `${cycle.joursSurSite} jours sur site / ${cycle.joursRepos} de repos` : `${JOURS_CYCLE_ROTATION} jours`}
              </strong>
              , <strong>week-ends compris</strong>, ancré sur la date de montée renseignée. Les jours de repos ne sont
              pas posés.
            </>
          )}
        </p>

        {/* L'horizon est celui du contrat (rev01, point 3) : le dire évite de
            chercher des dates d'affectation qui ne sont plus demandées. */}
        {horizon && (
          <p className="text-xs text-gray-500">
            Période couverte : <strong>{formatDate(horizon.debut)}</strong> → <strong>{formatDate(horizon.fin)}</strong>{' '}
            — celle du contrat de travail, renouvellements compris.
          </p>
        )}

        {propositions.map((p) => (
          <PropositionCarte key={p.employeId} proposition={p} inverse={p.employeId !== employe.id} />
        ))}

        {/* Reprogrammation : le seul cas où la génération écrase. Décochée
            par défaut — c'est un geste destructeur, il se demande. */}
        <label className="flex items-start gap-2 rounded-xl border border-gray-100 bg-white p-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={remplacer}
            onChange={(e) => setRemplacer(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <span>
            <span className="font-medium text-gray-900">Reprogrammer</span> — remplacer les jours déjà planifiés.
            <span className="block text-xs text-gray-500 mt-0.5">
              À utiliser quand les dates de rotation ont changé (maladie, remplacement). Sans cette case, un jour déjà
              posé n'est jamais touché.
            </span>
          </span>
        </label>

        {remplacer ? (
          <p className="text-xs text-amber-700 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {totalRemplaces === 0
              ? "Aucun jour déjà planifié dans la période : la reprogrammation ne remplacera rien."
              : `${totalRemplaces} jour(s) déjà planifié(s) seront remplacés, y compris les exceptions saisies à la main.`}
          </p>
        ) : (
          <p className="text-xs text-gray-500 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
            Un jour déjà planifié n'est jamais écrasé : les exceptions saisies à la main sont conservées. Relancer la
            génération ne change donc rien de ce qui a déjà été posé.
          </p>
        )}

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" size="sm" loading={enCours} disabled={total === 0} onClick={() => void appliquer()}>
            <CalendarPlus className="w-4 h-4 mr-1.5" />
            {total === 0 ? 'Rien à poser' : `Poser ${total} jour(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PropositionCarte({ proposition, inverse }: { proposition: PropositionPlanning; inverse: boolean }) {
  const jours = Object.entries(proposition.aPoser)
  const mois = parMois(proposition.aPoser)
  // Décompte par type d'affectation : « 56 jours sur site, 56 de repos » se
  // vérifie d'un coup d'œil, contrairement à un total de 112.
  const parType = jours.reduce<Record<string, number>>((acc, [, a]) => ({ ...acc, [a]: (acc[a] ?? 0) + 1 }), {})

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-sm font-medium text-gray-900">
        {proposition.libelle}
        {inverse && <span className="ml-2 text-xs font-normal text-accent">binôme — cycle inversé</span>}
      </p>

      {proposition.impossible ? (
        <p className="mt-1 text-xs text-amber-700 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {proposition.impossible}
        </p>
      ) : jours.length === 0 ? (
        <p className="mt-1 text-xs text-gray-500">
          Rien à poser — les {proposition.conserves} jour(s) de la période sont déjà planifiés.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-gray-600">
            {jours.length} jour(s) à poser :{' '}
            {Object.entries(parType)
              .map(([type, n]) => `${n} ${AFFECTATIONS[type as keyof typeof AFFECTATIONS].label.toLowerCase()}`)
              .join(' · ')}
            {proposition.conserves > 0 && (
              <span className="text-gray-400"> · {proposition.conserves} déjà planifié(s), conservé(s)</span>
            )}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Du {formatDate(jours[0][0])} au {formatDate(jours[jours.length - 1][0])} · {Object.keys(mois).length} mois (
            {Object.keys(mois).map(libelleMois).join(', ')})
          </p>
        </>
      )}
    </div>
  )
}
