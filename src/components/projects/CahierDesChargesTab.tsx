import { useRef, useState } from 'react'
import { Plus, FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import type { Projet } from '../../types/project'
import { useAuth } from '../../contexts/useAuth'
import { useProjects } from '../../contexts/useProjects'
import { formatDate } from '../../lib/format'
import { enregistrerDocumentCahierDesCharges, supprimerPieceJointe } from '../../lib/piecesJointes'
import { LienPieceJointe } from '../ui/PieceJointeApercu'
import type { PieceJointe } from '../../types/pieceJointe'

function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

// Cahier des charges du projet — centralise les documents de référence
// (PDF, Word, plans, etc.), retour utilisateur : module manquant sur la
// fiche projet. Réutilise l'infrastructure Storage mise en place pour les
// pièces jointes des hypothèses (lib/piecesJointes.ts).
export function CahierDesChargesTab({ projet }: { projet: Projet }) {
  const { currentUser, users } = useAuth()
  const { addDocumentCahierDesCharges, removeDocumentCahierDesCharges } = useProjects()
  const inputRef = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const documents = projet.cahierDesCharges ?? []

  const auteurName = (id: string) => users.find((u) => u.id === id)?.name ?? '—'

  const handleFile = async (file: File | undefined) => {
    if (!file || !currentUser) return
    setErreur(null)
    setEnCours(true)
    try {
      const document = await enregistrerDocumentCahierDesCharges(file, currentUser.id)
      addDocumentCahierDesCharges(projet.id, document)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'envoi du fichier.")
    } finally {
      setEnCours(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async (document: PieceJointe) => {
    if (!window.confirm('Supprimer ce document ?')) return
    await supprimerPieceJointe(document)
    removeDocumentCahierDesCharges(projet.id, document.id)
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-900">Cahier des charges du projet</h4>
          <p className="text-xs text-gray-500 mt-0.5">Documents de référence centralisés (PDF, Word, plans, etc.)</p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={enCours}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          {enCours ? 'Envoi…' : 'Ajouter un document'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {erreur && <p className="text-sm text-red-600 mb-3">{erreur}</p>}

      {documents.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun document de référence enregistré.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {documents.map((d) => (
            <div key={d.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              {d.type === 'image' ? <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" /> : <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
              <span className="flex-1 min-w-0">
                <LienPieceJointe piece={d} />
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">{formatTaille(d.tailleOctets)}</span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {auteurName(d.ajouteParId)} · {formatDate(d.ajouteLe.slice(0, 10))}
              </span>
              <button onClick={() => handleRemove(d)} title="Supprimer" className="text-gray-400 hover:text-red-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
