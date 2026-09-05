import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/useAuth'
import { useNavette } from '../../contexts/useNavette'
import type { RubriqueNiv1, RubriqueNiv2, LigneNavette } from '../../types/navette'
import type { ProjectType } from '../../types/project'
import { TYPE_LABELS } from '../../types/project'
import { useRepartitionBudget } from './useRepartitionBudget'
import { RepartitionBudgetFields } from './RepartitionBudgetFields'
import { SelecteurDevise } from '../ui/SelecteurDevise'
import { useDeviseParDefaut } from '../../lib/deviseParDefaut'

interface NewNavetteLigneModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (ligne: LigneNavette) => void
}

const selectClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'

const NIV1_OPTIONS: RubriqueNiv1[] = ['OPEX', 'CAPEX']

export function NewNavetteLigneModal({ isOpen, onClose, onCreated }: NewNavetteLigneModalProps) {
  const { currentUser, users } = useAuth()
  const { createLigne } = useNavette()
  const isAdmin = currentUser?.role === 'admin'
  const agents = users.filter((u) => u.role === 'agent')

  const [libelle, setLibelle] = useState('')
  const [type, setType] = useState<ProjectType>('avis')
  // Devise de la ligne : celle du système (pivot du référentiel), plutôt
  // qu'un 'USD' écrit en dur — et via `useDeviseParDefaut`, qui suit le pivot
  // tant que rien n'est choisi. Un `useState(pivot.code)` figeait la valeur
  // d'avant la lecture Firestore : cette modale est montée avec la page.
  const { devise, setDevise, reinitialiser: reinitialiserDevise } = useDeviseParDefaut()
  const [rubriqueNiv1, setRubriqueNiv1] = useState<RubriqueNiv1>('OPEX')
  // Le champ « Programme » (rubrique de niveau 2) a été retiré du formulaire
  // le 18/08/2026 à la demande de l'utilisateur. La valeur reste portée par le
  // modèle — `LigneNavette.rubriqueNiv2` est obligatoire, affichée sous la
  // rubrique dans le tableau et la modale de détail, et c'est un axe
  // d'agrégation du classeur : une ligne créée ici part donc sur GES, sans
  // que personne ne l'ait choisi.
  //
  // **23/08/2026** : elle n'est plus modifiable ailleurs non plus — le même
  // menu a été retiré de `NavetteLigneEditModal`, pour que la modification
  // d'une ligne demande exactement ce que sa création demande (demande
  // explicite). Les lignes reprises du classeur gardent la leur.
  const [rubriqueNiv2] = useState<RubriqueNiv2>('GES')
  // Exercice budgétaire décrit par les cycles de la ligne — l'année en cours
  // par défaut, c'est celle qu'on ouvre dans la quasi-totalité des cas.
  const [anneeBudget, setAnneeBudget] = useState(String(new Date().getFullYear()))
  const [codeOTP, setCodeOTP] = useState('')
  const [champ, setChamp] = useState('')
  const [chargeAffaireId, setChargeAffaireId] = useState(
    isAdmin ? agents[0]?.id ?? '' : currentUser?.id ?? ''
  )
  const [workProgram, setWorkProgram] = useState(false)
  const budget = useRepartitionBudget()

  const resetAndClose = () => {
    setLibelle('')
    setType('avis')
    reinitialiserDevise()
    setAnneeBudget(String(new Date().getFullYear()))
    setCodeOTP('')
    setChamp('')
    setWorkProgram(false)
    budget.reset()
    onClose()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    if (!budget.repartitionValide) return

    const resolvedChargeAffaireId = isAdmin ? chargeAffaireId : currentUser.id

    const ligne = await createLigne({
      rubriqueNiv1,
      rubriqueNiv2,
      anneeBudget: anneeBudget.trim() === '' ? undefined : Number(anneeBudget),
      codeOTP,
      champ: champ || undefined,
      libelle,
      chargeAffaireId: resolvedChargeAffaireId,
      type,
      devise,
      workProgram,
      BU: budget.repartition,
    })

    onCreated?.(ligne)
    resetAndClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="Nouvelle ligne navette" maxWidth="max-w-5xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Libellé" value={libelle} onChange={(e) => setLibelle(e.target.value)} required />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Type de projet</label>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <SelecteurDevise value={devise} onChange={setDevise} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Rubrique</label>
          <select className={selectClass} value={rubriqueNiv1} onChange={(e) => setRubriqueNiv1(e.target.value as RubriqueNiv1)}>
            {NIV1_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <Input
          label="Année du budget"
          type="number"
          min={2000}
          max={2100}
          step={1}
          value={anneeBudget}
          onChange={(e) => setAnneeBudget(e.target.value)}
          placeholder={String(new Date().getFullYear())}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input label="Code OTP" value={codeOTP} onChange={(e) => setCodeOTP(e.target.value)} placeholder="GA-XXX-000000" required />
          <Input label="Champ (site)" value={champ} onChange={(e) => setChamp(e.target.value)} placeholder="AGM, TRM, BDM..." />
        </div>

        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Chargé d'affaires</label>
            <select className={selectClass} value={chargeAffaireId} onChange={(e) => setChargeAffaireId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <RepartitionBudgetFields {...budget} devise={devise} />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={workProgram} onChange={(e) => setWorkProgram(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary/40" />
          Fait partie du Work Program (WP)
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={resetAndClose}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={!budget.repartitionValide}>Créer la ligne navette</Button>
        </div>
      </form>
    </Modal>
  )
}
