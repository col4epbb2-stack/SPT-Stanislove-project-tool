import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Projet } from '../../types/project'
import type { CommandeMaterielInput } from '../../types/procurement'
import { STATUT_COMMANDE_LABELS, STATUT_COMMANDE_COLORS, statutCommandeMateriel } from '../../types/procurement'
import { useProjects } from '../../contexts/useProjects'
import { formatDate } from '../../lib/format'
import { ProcurementLie } from './ProcurementLie'

function NewCommandeForm({ projetId, onDone }: { projetId: string; onDone: () => void }) {
  const { addCommandeMateriel } = useProjects()
  const [designation, setDesignation] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [dateCommande, setDateCommande] = useState('')
  const [dateExpeditionPrevue, setDateExpeditionPrevue] = useState('')
  const [dateReceptionPrevue, setDateReceptionPrevue] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const input: CommandeMaterielInput = { designation, fournisseur, dateCommande, dateExpeditionPrevue, dateReceptionPrevue }
    addCommandeMateriel(projetId, input)
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mb-4 border border-gray-100 rounded-xl p-4">
      <Input label="Désignation du matériel" value={designation} onChange={(e) => setDesignation(e.target.value)} required />
      <Input label="Fournisseur" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} required />
      <div className="grid grid-cols-3 gap-3">
        <Input label="Date commande" type="date" value={dateCommande} onChange={(e) => setDateCommande(e.target.value)} required />
        <Input label="Expédition prévue" type="date" value={dateExpeditionPrevue} onChange={(e) => setDateExpeditionPrevue(e.target.value)} required />
        <Input label="Réception prévue" type="date" value={dateReceptionPrevue} onChange={(e) => setDateReceptionPrevue(e.target.value)} required />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button type="submit" size="sm">Ajouter</Button>
      </div>
    </form>
  )
}

export function ProcurementTab({ projet }: { projet: Projet }) {
  const { receptionCommandeMateriel } = useProjects()
  const [showForm, setShowForm] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-gray-900">Achats à l'étranger</h4>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <Plus className="w-3.5 h-3.5" />
            Ajouter une commande
          </button>
        )}
      </div>

      {showForm && <NewCommandeForm projetId={projet.id} onDone={() => setShowForm(false)} />}

      {projet.procurement.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune commande de matériel enregistrée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Désignation</th>
                <th className="py-2 px-3 font-medium">Fournisseur</th>
                <th className="py-2 px-3 font-medium">Expédition prévue</th>
                <th className="py-2 px-3 font-medium">Réception prévue</th>
                <th className="py-2 px-3 font-medium">Statut</th>
                <th className="py-2 pl-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projet.procurement.map((c) => {
                const statut = statutCommandeMateriel(c)
                const colors = STATUT_COMMANDE_COLORS[statut]
                return (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 text-gray-900 font-medium">{c.designation}</td>
                    <td className="py-2 px-3 text-gray-600">{c.fournisseur}</td>
                    <td className="py-2 px-3 text-gray-600">{formatDate(c.dateExpeditionPrevue)}</td>
                    <td className="py-2 px-3 text-gray-600">{formatDate(c.dateReceptionPrevue)}</td>
                    <td className="py-2 px-3">
                      <Badge label={STATUT_COMMANDE_LABELS[statut]} bg={colors.bg} text={colors.text} />
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {!c.dateReceptionReelle && (
                        <button
                          onClick={() => receptionCommandeMateriel(projet.id, c.id, new Date().toISOString().slice(0, 10))}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Marquer reçu
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProcurementLie projet={projet} />
    </div>
  )
}
