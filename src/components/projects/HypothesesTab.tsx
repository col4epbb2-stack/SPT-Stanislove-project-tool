import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, CheckCircle2, Trash2, Eye, EyeOff } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Projet } from '../../types/project'
import type { Hypothese, HypotheseInput } from '../../types/hypothese'
import { useAuth } from '../../contexts/useAuth'
import { useProjects } from '../../contexts/useProjects'
import { formatDate } from '../../lib/format'
import { enregistrerPieceJointeHypothese, supprimerPieceJointe } from '../../lib/piecesJointes'
import { ImagePieceJointe, LienPieceJointe } from '../ui/PieceJointeApercu'
import type { PieceJointe } from '../../types/pieceJointe'

const textareaClass =
  'w-full px-3 py-2 rounded-lg border text-sm bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition min-h-16'

// Une couleur de contour distincte par hypothèse (retour utilisateur :
// "distinguer facilement les différentes hypothèses"), cyclique — le
// scénario retenu garde en plus son propre traitement visuel (voir plus bas)
// pour rester identifiable même si la couleur d'un rang se répète au-delà de
// la palette.
const PALETTE_HYPOTHESES = [
  { border: 'border-blue-300', badge: 'bg-blue-100 text-blue-700' },
  { border: 'border-purple-300', badge: 'bg-purple-100 text-purple-700' },
  { border: 'border-teal-300', badge: 'bg-teal-100 text-teal-700' },
  { border: 'border-amber-300', badge: 'bg-amber-100 text-amber-700' },
  { border: 'border-rose-300', badge: 'bg-rose-100 text-rose-700' },
  { border: 'border-indigo-300', badge: 'bg-indigo-100 text-indigo-700' },
]

const CHAMPS_COMPARAISON: { cle: keyof Hypothese; label: string }[] = [
  { cle: 'avantages', label: 'Avantages' },
  { cle: 'inconvenients', label: 'Inconvénients' },
  { cle: 'contraintes', label: 'Contraintes' },
  { cle: 'pointsBloquants', label: 'Points bloquants' },
  { cle: 'planAction', label: "Plan d'action" },
]

function NewHypotheseForm({ projetId, onDone }: { projetId: string; onDone: () => void }) {
  const { addHypothese } = useProjects()
  const [titre, setTitre] = useState('')
  const [avantages, setAvantages] = useState('')
  const [inconvenients, setInconvenients] = useState('')
  const [contraintes, setContraintes] = useState('')
  const [pointsBloquants, setPointsBloquants] = useState('')
  const [planAction, setPlanAction] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const input: HypotheseInput = { titre, avantages, inconvenients, contraintes, pointsBloquants, planAction }
    addHypothese(projetId, input)
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mb-4 border border-gray-100 rounded-xl p-4">
      <Input label="Titre du scénario" value={titre} onChange={(e) => setTitre(e.target.value)} required />
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Avantages</label>
          <textarea className={textareaClass} value={avantages} onChange={(e) => setAvantages(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Inconvénients</label>
          <textarea className={textareaClass} value={inconvenients} onChange={(e) => setInconvenients(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Contraintes</label>
          <textarea className={textareaClass} value={contraintes} onChange={(e) => setContraintes(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Points bloquants</label>
          <textarea className={textareaClass} value={pointsBloquants} onChange={(e) => setPointsBloquants(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Plan d'action</label>
          <textarea className={textareaClass} value={planAction} onChange={(e) => setPlanAction(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button type="submit" size="sm">Ajouter le scénario</Button>
      </div>
    </form>
  )
}

function PiecesJointesSection({ projetId, hypothese }: { projetId: string; hypothese: Hypothese }) {
  const { currentUser } = useAuth()
  const { addPieceJointeHypothese, removePieceJointeHypothese } = useProjects()
  const inputRef = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const pieces = hypothese.piecesJointes ?? []

  const handleFile = async (file: File | undefined) => {
    if (!file || !currentUser) return
    setErreur(null)
    setEnCours(true)
    try {
      const piece = await enregistrerPieceJointeHypothese(file, currentUser.id)
      addPieceJointeHypothese(projetId, hypothese.id, piece)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'envoi du fichier.")
    } finally {
      setEnCours(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async (piece: PieceJointe) => {
    if (!window.confirm('Supprimer cette pièce jointe ?')) return
    await supprimerPieceJointe(piece)
    removePieceJointeHypothese(projetId, hypothese.id, piece.id)
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-gray-500 text-xs">Images, plans (PDF), schémas de comparaison</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={enCours}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          {enCours ? 'Envoi…' : 'Ajouter un fichier'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {erreur && <p className="text-xs text-red-600 mb-2">{erreur}</p>}

      {pieces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pieces.map((pj) => (
            <div key={pj.id} className="relative group">
              {pj.type === 'image' ? (
                <ImagePieceJointe piece={pj} />
              ) : (
                <span
                  className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                  title={pj.nom}
                >
                  <LienPieceJointe piece={pj}>
                    <span className="sr-only">{pj.nom}</span>
                  </LienPieceJointe>
                  <span className="text-[10px] px-1 truncate max-w-full">PDF</span>
                </span>
              )}
              <button
                onClick={() => handleRemove(pj)}
                title="Supprimer"
                className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-0.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ComparaisonScenarios({ hypotheses }: { hypotheses: Hypothese[] }) {
  return (
    <div className="overflow-x-auto mb-4 border border-gray-100 rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="px-3 py-2 font-medium whitespace-nowrap"> </th>
            {hypotheses.map((h, i) => (
              <th key={h.id} className="px-3 py-2 font-medium whitespace-nowrap">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-1.5 ${PALETTE_HYPOTHESES[i % PALETTE_HYPOTHESES.length].badge}`}>
                  {i + 1}
                </span>
                {h.titre}
                {h.retenue && <span className="ml-1.5 text-primary">★</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {CHAMPS_COMPARAISON.map(({ cle, label }) => (
            <tr key={cle}>
              <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top">{label}</td>
              {hypotheses.map((h) => (
                <td key={h.id} className="px-3 py-2 text-gray-800 align-top min-w-48">
                  {(h[cle] as string) || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HypothesesTab({ projet }: { projet: Projet }) {
  const { currentUser, users } = useAuth()
  const { retenirHypothese, addCommentaireHypothese } = useProjects()
  const [showForm, setShowForm] = useState(false)
  const [showComparaison, setShowComparaison] = useState(false)
  const [commentaire, setCommentaire] = useState('')

  const handleAddCommentaire = (e: FormEvent) => {
    e.preventDefault()
    if (!currentUser || !commentaire.trim()) return
    addCommentaireHypothese(projet.id, currentUser.id, commentaire)
    setCommentaire('')
  }

  const handleRetenir = (h: Hypothese) => {
    if (!currentUser) return
    if (!window.confirm(`Valider l'arbitrage : "${h.titre}" devient le scénario retenu pour ce projet — confirmer ?`)) return
    retenirHypothese(projet.id, h.id, currentUser.id)
  }

  const auteurName = (id: string) => users.find((u) => u.id === id)?.name ?? '—'

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3 gap-3">
          <h4 className="font-semibold text-gray-900">Hypothèses de réalisation</h4>
          <div className="flex items-center gap-3 shrink-0">
            {projet.hypotheses.length > 1 && (
              <button
                onClick={() => setShowComparaison((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {showComparaison ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showComparaison ? 'Masquer la comparaison' : 'Comparer les scénarios'}
              </button>
            )}
            {!showForm && (
              <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" />
                Ajouter un scénario
              </button>
            )}
          </div>
        </div>

        {showForm && <NewHypotheseForm projetId={projet.id} onDone={() => setShowForm(false)} />}

        {showComparaison && projet.hypotheses.length > 1 && <ComparaisonScenarios hypotheses={projet.hypotheses} />}

        {projet.hypotheses.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun scénario enregistré.</p>
        ) : (
          <div className="space-y-3">
            {projet.hypotheses.map((h, i) => {
              const couleur = PALETTE_HYPOTHESES[i % PALETTE_HYPOTHESES.length]
              return (
                <div
                  key={h.id}
                  className={`border-2 rounded-xl p-4 ${h.retenue ? 'border-primary bg-primary/5' : couleur.border}`}
                >
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 ${couleur.badge}`}>
                        {i + 1}
                      </span>
                      <p className="font-medium text-gray-900">{h.titre}</p>
                    </div>
                    {h.retenue ? (
                      <Badge label="Retenue" bg="bg-primary/10" text="text-primary" />
                    ) : (
                      <button onClick={() => handleRetenir(h)} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-primary">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Retenir ce scénario
                      </button>
                    )}
                  </div>

                  {h.retenue && h.valideeParId && h.valideeLe && (
                    <p className="text-xs text-primary/80 mb-2">
                      Arbitrage validé par {auteurName(h.valideeParId)} le {formatDate(h.valideeLe)}
                    </p>
                  )}

                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">Avantages</p>
                      <p className="text-gray-800">{h.avantages || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Inconvénients</p>
                      <p className="text-gray-800">{h.inconvenients || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Contraintes</p>
                      <p className="text-gray-800">{h.contraintes || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Points bloquants</p>
                      <p className="text-gray-800">{h.pointsBloquants || '—'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-gray-500 text-xs">Plan d'action</p>
                      <p className="text-gray-800">{h.planAction || '—'}</p>
                    </div>
                  </div>

                  <PiecesJointesSection projetId={projet.id} hypothese={h} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Commentaires & remarques</h4>

        <form onSubmit={handleAddCommentaire} className="flex flex-wrap items-end gap-3 mb-4">
          <Input label="Ajouter un commentaire" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className="flex-1 min-w-48" />
          <Button type="submit" size="sm">Publier</Button>
        </form>

        {projet.commentairesHypotheses.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun commentaire pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {projet.commentairesHypotheses.map((c) => (
              <div key={c.id} className="border border-gray-100 rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900">{auteurName(c.auteurId)}</span>
                  <span className="text-xs text-gray-400">{formatDate(c.date)}</span>
                </div>
                <p className="text-gray-700">{c.texte}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
