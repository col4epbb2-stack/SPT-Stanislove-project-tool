import { useState } from 'react'
import type { FormEvent } from 'react'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { EnteteSection } from '../ui/ChampsSaisie'
import { aujourdHui } from '../../lib/saisie'
import type { ActiviteInput } from '../../types/planning'

// Création d'une phase avec ses activités (18/08/2026, demande explicite
// « lors de l'ajout d'une phase on doit avoir la possibilité de rajouter
// plusieurs activités liées à cette phase »).
//
// Une activité est une tâche de planning : c'est elle qui donne à la phase un
// avancement, une place dans le diagramme d'état et une courbe en S — une
// phase sans activité n'apparaît nulle part ailleurs que dans cette liste.
// Les créer au même endroit que la phase évite l'aller-retour vers l'onglet
// Planning, où il fallait jusqu'ici retaper le nom de la phase à chaque
// tâche.
//
// Le même formulaire sert à ajouter des activités à une phase existante
// (`phaseExistante`) : le nom est alors figé, seule la liste est ouverte.

type Ligne = ActiviteInput & { cle: string }

function ligneVide(): Ligne {
  return { cle: crypto.randomUUID(), nom: '', dateDebut: aujourdHui(), dateFin: aujourdHui() }
}

export function PhaseSaisieForm({
  isOpen,
  phaseExistante,
  nomsExistants,
  onClose,
  onSubmit,
}: {
  isOpen: boolean
  /** Renseigné : on n'ajoute que des activités à cette phase. */
  phaseExistante?: string
  /** Noms déjà pris — deux phases de même nom fusionneraient leur suivi. */
  nomsExistants: string[]
  onClose: () => void
  onSubmit: (phase: string, activites: ActiviteInput[]) => void
}) {
  const [nom, setNom] = useState(phaseExistante ?? '')
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide()])

  const modifier = (cle: string, champ: keyof ActiviteInput, valeur: string) =>
    setLignes((prev) => prev.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)))

  const nomPhase = phaseExistante ?? nom.trim()
  const doublon = !phaseExistante && nomPhase !== '' && nomsExistants.includes(nomPhase)
  // Une ligne entièrement vide n'est pas une erreur : c'est la ligne offerte
  // par défaut, qu'on peut laisser telle quelle pour créer la phase seule.
  const renseignees = lignes.filter((l) => l.nom.trim() !== '')
  const datesIncoherentes = renseignees.some((l) => !l.dateDebut || !l.dateFin || l.dateFin < l.dateDebut)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!nomPhase || doublon || datesIncoherentes) return
    if (phaseExistante && renseignees.length === 0) return
    onSubmit(
      nomPhase,
      renseignees.map(({ nom: n, dateDebut, dateFin }) => ({ nom: n, dateDebut, dateFin }))
    )
    onClose()
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={phaseExistante ? `Activités de la phase « ${phaseExistante} »` : 'Nouvelle phase'}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {!phaseExistante && (
          <Input
            label="Nom de la phase"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="ex. Réception"
            autoFocus
            required
            error={doublon ? 'Cette phase existe déjà.' : undefined}
          />
        )}

        <div className="space-y-3">
          <EnteteSection
            titre="Activités de la phase"
            aide="Chaque activité devient une tâche de planning (Baseline, Forecast et Réalisé) : c'est ce qui donne son avancement à la phase. Vous pouvez créer la phase sans activité et en ajouter plus tard."
          />

          <div className="space-y-2">
            {lignes.map((ligne, index) => (
              <div key={ligne.cle} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Activité {index + 1}</label>
                  <input
                    value={ligne.nom}
                    onChange={(e) => modifier(ligne.cle, 'nom', e.target.value)}
                    placeholder="ex. Contrôle dimensionnel"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Début</label>
                  <input
                    type="date"
                    value={ligne.dateDebut}
                    max={ligne.dateFin || undefined}
                    onChange={(e) => modifier(ligne.cle, 'dateDebut', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fin</label>
                  <input
                    type="date"
                    value={ligne.dateFin}
                    min={ligne.dateDebut || undefined}
                    onChange={(e) => modifier(ligne.cle, 'dateFin', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end pb-1">
                  <button
                    type="button"
                    onClick={() => setLignes((prev) => (prev.length === 1 ? [ligneVide()] : prev.filter((l) => l.cle !== ligne.cle)))}
                    title="Retirer cette activité"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLignes((prev) => [...prev, ligneVide()])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter une activité
          </button>

          {datesIncoherentes && (
            <p className="text-xs text-red-600">Chaque activité renseignée a besoin d'une date de début et d'une date de fin postérieure.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 inline-flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" />
            {renseignees.length === 0
              ? 'Aucune activité — la phase sera créée seule.'
              : `${renseignees.length} activité(s) à créer`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!nomPhase || doublon || datesIncoherentes || (!!phaseExistante && renseignees.length === 0)}
            >
              {phaseExistante ? 'Ajouter les activités' : 'Créer la phase'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
