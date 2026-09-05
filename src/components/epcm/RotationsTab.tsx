import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { SelectChamp } from '../ui/ChampsSaisie'
import { TableauColonnes, type ColonneTableau } from '../ui/TableauColonnes'
import { nomComplet, rotationDerivee, type RotationDerivee } from '../../lib/contratEpcmEngine'
import { formatDate } from '../../lib/format'
import { EnteteOnglet, MessageVide } from './elements'
import type { RotationInput } from '../../lib/contratEpcmFirestore'
import type { EmployeEpcm, PlanningMoisEpcm, RotationEpcm } from '../../types/contratEpcm'

// Onglet « Rotations » (§6). Les jours sur site / bureau / repos ne sont pas
// saisis : ils sont comptés dans le planning de la période (cf.
// `rotationDerivee`) — les saisir en double, c'est se garantir deux vérités
// différentes. Une rotation dont la période est passée mais dont des jours
// n'ont jamais été planifiés est signalée incomplète, et remonte en alerte.

function RotationForm({
  employes,
  rotationInitiale,
  onClose,
  onSubmit,
}: {
  employes: EmployeEpcm[]
  rotationInitiale: RotationEpcm | null
  onClose: () => void
  onSubmit: (input: RotationInput) => Promise<void>
}) {
  const [employeId, setEmployeId] = useState(rotationInitiale?.employeId ?? employes[0]?.id ?? '')
  const [debut, setDebut] = useState(rotationInitiale?.debut ?? '')
  const [fin, setFin] = useState(rotationInitiale?.fin ?? '')
  const [cycle, setCycle] = useState(rotationInitiale?.cycleTheorique ?? '')
  const [commentaire, setCommentaire] = useState(rotationInitiale?.commentaire ?? '')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (fin < debut) {
      setErreur('La fin de rotation ne peut pas précéder son début.')
      return
    }
    setErreur(null)
    setEnvoi(true)
    try {
      await onSubmit({ employeId, debut, fin, cycleTheorique: cycle || null, commentaire: commentaire || null })
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SelectChamp
        label="Employé"
        value={employeId}
        onChange={setEmployeId}
        options={undefined}
      >
        {employes.map((e) => (
          <option key={e.id} value={e.id}>
            {nomComplet(e)}
          </option>
        ))}
      </SelectChamp>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Début" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required />
        <Input label="Fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} required />
      </div>
      <Input
        label="Cycle théorique"
        value={cycle}
        onChange={(e) => setCycle(e.target.value)}
        placeholder="Ex. 28/28"
      />
      <Input label="Commentaire" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={envoi} disabled={!employeId}>
          Enregistrer la rotation
        </Button>
      </div>
    </form>
  )
}

export function RotationsTab({
  employes,
  rotations,
  plannings,
  dateArrete,
  modifiable,
  onEnregistrer,
  onSupprimer,
}: {
  employes: EmployeEpcm[]
  rotations: RotationEpcm[]
  plannings: PlanningMoisEpcm[]
  dateArrete: string
  modifiable: boolean
  onEnregistrer: (input: RotationInput, initiale: RotationEpcm | null) => Promise<void>
  onSupprimer: (rotation: RotationEpcm) => Promise<void>
}) {
  const [formOuvert, setFormOuvert] = useState(false)
  const [enEdition, setEnEdition] = useState<RotationEpcm | null>(null)

  const derivees = useMemo(
    () =>
      rotations
        .map((r) => rotationDerivee(r, employes, plannings, dateArrete))
        .sort((a, b) => b.rotation.debut.localeCompare(a.rotation.debut)),
    [rotations, employes, plannings, dateArrete]
  )

  const ouvrir = (rotation: RotationEpcm | null) => {
    setEnEdition(rotation)
    setFormOuvert(true)
  }

  const colonnes: ColonneTableau<RotationDerivee>[] = [
    ...(modifiable
      ? [
          {
            cle: 'actions',
            entete: '',
            valeur: (d: RotationDerivee) => (
              <div className="flex items-center gap-2">
                <button onClick={() => ouvrir(d.rotation)} title="Modifier" className="text-gray-400 hover:text-primary">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Supprimer la rotation du ${d.rotation.debut} au ${d.rotation.fin} ?`)) {
                      void onSupprimer(d.rotation)
                    }
                  }}
                  title="Supprimer"
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          },
        ]
      : []),
    {
      cle: 'employe',
      entete: 'Employé',
      valeur: (d) => <span className="font-medium text-gray-900">{d.employe ? nomComplet(d.employe) : '—'}</span>,
    },
    { cle: 'debut', entete: 'Début', valeur: (d) => formatDate(d.rotation.debut) },
    { cle: 'fin', entete: 'Fin', valeur: (d) => formatDate(d.rotation.fin) },
    { cle: 'duree', entete: 'Durée (j)', align: 'right', valeur: (d) => d.joursTotal },
    { cle: 'site', entete: 'Sur site', align: 'right', valeur: (d) => d.joursSite },
    { cle: 'bureau', entete: 'Bureau', align: 'right', valeur: (d) => d.joursBureau },
    { cle: 'repos', entete: 'Repos', align: 'right', valeur: (d) => d.joursRepos },
    { cle: 'cycleTheorique', entete: 'Cycle théorique', valeur: (d) => d.rotation.cycleTheorique ?? '—' },
    { cle: 'cycleConstate', entete: 'Cycle constaté', valeur: (d) => d.cycleConstate },
    {
      cle: 'etat',
      entete: 'État',
      valeur: (d) =>
        d.complete ? (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700">Complète</span>
        ) : (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              d.terminee ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-600'
            }`}
            title={`${d.joursNonPlanifies} jour(s) sans affectation au planning`}
          >
            {d.terminee ? 'Incomplète' : `En cours · ${d.joursNonPlanifies} j à planifier`}
          </span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre={`Rotations (${rotations.length})`}
        aide="Les jours sur site, au bureau et de repos sont comptés dans le planning de la période — ils ne se saisissent pas ici."
      >
        {modifiable && (
          <Button onClick={() => ouvrir(null)} disabled={employes.length === 0}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle rotation
          </Button>
        )}
      </EnteteOnglet>

      {rotations.length === 0 ? (
        <MessageVide>Aucune rotation déclarée.</MessageVide>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <TableauColonnes
            colonnes={colonnes}
            lignes={derivees}
            cleLigne={(d) => d.rotation.id}
            exportation={{ nomFichier: 'epcm-rotations', titre: 'EPCM — rotations' }}
          />
        </div>
      )}

      <Modal isOpen={formOuvert} onClose={() => setFormOuvert(false)} title={enEdition ? 'Modifier la rotation' : 'Nouvelle rotation'}>
        <RotationForm
          employes={employes.filter((e) => e.statut === 'ACTIF' || e.id === enEdition?.employeId)}
          rotationInitiale={enEdition}
          onClose={() => setFormOuvert(false)}
          onSubmit={(input) => onEnregistrer(input, enEdition)}
        />
      </Modal>
    </div>
  )
}
