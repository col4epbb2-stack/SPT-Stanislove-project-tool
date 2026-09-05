import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowLeft, CheckCircle2, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/useAuth'
import { getAvatarColor } from '../../lib/avatarColors'
import { getInitials } from '../../lib/userHelpers'
import { formatHeure, formatJourRelatif } from '../../lib/format'
import type { MessageDiscussion, SujetDiscussion } from '../../types/discussion'

function jour(iso: string): string {
  return iso.slice(0, 10)
}

// Un message et son en-tête. L'auteur est ré-résolu dans l'annuaire
// (couleur d'avatar, nom à jour) avec repli sur le nom recopié à l'envoi si
// le compte n'y est plus.
function Message({
  message,
  estMoi,
  peutSupprimer,
  onSupprimer,
}: {
  message: MessageDiscussion
  estMoi: boolean
  peutSupprimer: boolean
  onSupprimer: () => void
}) {
  const { users } = useAuth()
  const auteur = users.find((u) => u.id === message.auteurId)
  const nom = auteur?.name ?? message.auteurNom
  const couleur = getAvatarColor(auteur?.avatarColor)

  return (
    <div className={`flex gap-3 group ${estMoi ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${couleur.bgClass}`}
        title={nom}
      >
        <span className={`text-xs font-bold ${couleur.textClass}`}>{getInitials(nom)}</span>
      </div>

      <div className={`max-w-[75%] min-w-0 ${estMoi ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-700">{estMoi ? 'Vous' : nom}</span>
          <span className="text-[11px] text-gray-400">{formatHeure(message.envoyeLe)}</span>
          {peutSupprimer && (
            <button
              onClick={onSupprimer}
              title="Supprimer ce message"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
            estMoi ? 'bg-primary text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
          }`}
        >
          {message.texte}
        </div>
      </div>
    </div>
  )
}

export function FilMessages({
  sujet,
  messages,
  chargement,
  erreur,
  peutModererSujet,
  onEnvoyer,
  onSupprimerMessage,
  onBasculerCloture,
  onSupprimerSujet,
  onRetour,
}: {
  sujet: SujetDiscussion
  messages: MessageDiscussion[]
  chargement: boolean
  erreur: string | null
  peutModererSujet: boolean
  onEnvoyer: (texte: string) => Promise<void>
  onSupprimerMessage: (message: MessageDiscussion) => Promise<void>
  onBasculerCloture: () => Promise<void>
  // Fourni aux seuls admins (cf. firestore.rules : supprimer un sujet leur
  // est réservé, clôturer reste ouvert à l'auteur).
  onSupprimerSujet?: () => Promise<void>
  onRetour: () => void
}) {
  const { currentUser } = useAuth()
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const finDuFil = useRef<HTMLDivElement>(null)

  // Le fil s'ouvre et se maintient sur son dernier message (comportement
  // attendu d'une messagerie) — y compris à l'arrivée d'un message d'un
  // autre poste, l'abonnement temps réel rejouant cet effet.
  useEffect(() => {
    finDuFil.current?.scrollIntoView({ block: 'end' })
  }, [sujet.id, messages.length])

  if (!currentUser) return null

  const envoyer = async () => {
    const contenu = texte.trim()
    if (!contenu || envoi) return
    setEnvoi(true)
    try {
      await onEnvoyer(contenu)
      setTexte('')
    } finally {
      setEnvoi(false)
    }
  }

  // Entrée envoie, Maj+Entrée passe à la ligne — convention de messagerie.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void envoyer()
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 shrink-0 flex items-start gap-3">
        <button onClick={onRetour} className="lg:hidden text-gray-400 hover:text-gray-600 p-1 -ml-1 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-gray-900 truncate">{sujet.titre}</h3>
            <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-medium">{sujet.theme}</span>
            {sujet.cloture && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-[11px] font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                Clôturé
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Ouvert par {sujet.auteurNom} · {sujet.nombreMessages} message{sujet.nombreMessages > 1 ? 's' : ''}
          </p>
          {sujet.description && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{sujet.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {peutModererSujet && (
            <Button variant="ghost" size="sm" onClick={() => void onBasculerCloture()}>
              {sujet.cloture ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Rouvrir
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Clôturer
                </>
              )}
            </Button>
          )}
          {onSupprimerSujet && (
            <button
              onClick={() => {
                if (window.confirm(`Supprimer le sujet "${sujet.titre}" et tous ses messages ?`)) void onSupprimerSujet()
              }}
              title="Supprimer ce sujet"
              className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {chargement && <p className="text-sm text-gray-400">Chargement des messages…</p>}
        {!chargement && messages.length === 0 && !erreur && (
          <p className="text-sm text-gray-400 text-center py-8">
            Aucun message — lancez la discussion.
          </p>
        )}

        {messages.map((message, i) => {
          const nouveauJour = i === 0 || jour(messages[i - 1].envoyeLe) !== jour(message.envoyeLe)
          return (
            <div key={message.id} className="space-y-5">
              {nouveauJour && (
                <div className="flex items-center gap-3">
                  <span className="flex-1 h-px bg-gray-100" />
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                    {formatJourRelatif(message.envoyeLe)}
                  </span>
                  <span className="flex-1 h-px bg-gray-100" />
                </div>
              )}
              <Message
                message={message}
                estMoi={message.auteurId === currentUser.id}
                peutSupprimer={message.auteurId === currentUser.id || peutModererSujet}
                onSupprimer={() => void onSupprimerMessage(message)}
              />
            </div>
          )
        })}
        <div ref={finDuFil} />
      </div>

      <div className="border-t border-gray-200 p-3 sm:p-4 shrink-0">
        {sujet.cloture ? (
          <p className="text-sm text-gray-400 text-center py-2">
            Sujet clôturé — rouvrez-le pour continuer la discussion.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition"
            />
            <Button onClick={() => void envoyer()} loading={envoi} disabled={!texte.trim()} className="shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
