import { useState } from 'react'
import { MessageSquare, Send, Trash2, TrendingUp } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { champFormClass } from '../ui/classes'
import { useAuth } from '../../contexts/useAuth'
import { useProjects } from '../../contexts/useProjects'
import { useNavette } from '../../contexts/useNavette'
import type { Projet } from '../../types/project'
import { CYCLE_BUDGET_LABELS, pdcRevises, totalBudget, tauxPour } from '../../types/navette'
import { formatDepuis } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'

// Deux blocs de la fiche projet accessibles depuis la liste : les révisions
// PDC qui la concernent et son fil de commentaires.
//
// Les PDC sont en **lecture seule** : réviser un budget est un acte de la
// navette (arbitrage proposé, puis validé par un admin, avec sa fenêtre de
// révision et son éventuel prélèvement sur la cale — cf. NavetteContext et
// ArbitrageModal). Le projet se contente d'afficher le résultat des lignes
// navette qui lui sont rattachées ; rien n'est saisi ni recalculé ici, sans
// quoi la même révision existerait à deux endroits avec deux valeurs
// possibles.

export function PdcCommentairesModal({ projet, onClose }: { projet: Projet | null; onClose: () => void }) {
  const { montant: formatMontant, uniteSysteme } = useMontant()
  // `pdcRevises()` cumule des lignes de devises différentes : son résultat est
  // dans la devise du système (le pivot), pas en dollars — « KUSD » écrit en
  // dur le faisait reconvertir une seconde fois (21/08/2026).
  const unitePivot = uniteSysteme()
  const { currentUser, users } = useAuth()
  const { ajouterCommentaireProjet, supprimerCommentaireProjet } = useProjects()
  const { lignes, tauxChange } = useNavette()
  const [nouveauCommentaire, setNouveauCommentaire] = useState('')

  if (!projet || !currentUser) return null

  const isAdmin = currentUser.role === 'admin'
  const nomAuteur = (id: string) => users.find((u) => u.id === id)?.name ?? 'Utilisateur inconnu'

  // Une fiche projet peut être la cible de plusieurs lignes navette
  // (linkToProject ne l'interdit pas) — les montants sont donc cumulés, et
  // convertis dans la devise du système puisque ces lignes peuvent être de
  // devises différentes.
  const lignesProjet = lignes.filter((l) => l.projetId === projet.id)
  const pdc = pdcRevises(lignesProjet, tauxChange)
  // pdcRevises conserve l'ordre chronologique des cycles : le dernier est la
  // révision qui fait foi.
  const dernier = pdc.length > 0 ? pdc[pdc.length - 1] : null
  const budgetBU = lignesProjet.reduce(
    (somme, l) => somme + totalBudget(l.cycles.BU) * tauxPour(l.devise, tauxChange),
    0
  )
  const ecart = dernier ? dernier.montant - budgetBU : null

  const commentaires = [...(projet.commentaires ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  const envoyerCommentaire = () => {
    const texte = nouveauCommentaire.trim()
    if (!texte) return
    ajouterCommentaireProjet(projet.id, currentUser.id, texte)
    setNouveauCommentaire('')
  }

  return (
    <Modal isOpen={!!projet} onClose={onClose} title={projet.nom} maxWidth="max-w-3xl">
      <div className="space-y-8">
        <section>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-gray-900">PDC révisés</h4>
            <Badge label="Lecture seule" bg="bg-gray-100" text="text-gray-500" />
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Repris des lignes navette rattachées à cette fiche. Les révisions se font dans la Navette.
          </p>

          {lignesProjet.length === 0 ? (
            <p className="text-sm text-gray-400">
              Aucune ligne navette n'est liée à cette fiche — il n'y a donc pas de PDC à afficher.
            </p>
          ) : pdc.length === 0 ? (
            <p className="text-sm text-gray-400">
              Aucun PDC révisé pour l'instant : {lignesProjet.length === 1 ? 'la ligne navette liée pilote' : 'les lignes navette liées pilotent'}{' '}
              encore sur le budget initial ({formatMontant(budgetBU, unitePivot)}).
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-xs font-medium text-gray-500">Budget initial (BU)</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{formatMontant(budgetBU, unitePivot)}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-xs font-medium text-gray-500">Dernier PDC révisé</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                    {formatMontant(dernier!.montant, unitePivot)}
                  </p>
                  <p className="text-xs text-gray-400">{CYCLE_BUDGET_LABELS[dernier!.cycleId]}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-xs font-medium text-gray-500">Écart au budget initial</p>
                  <p
                    className={`text-lg font-bold tabular-nums ${
                      ecart == null ? 'text-gray-300' : ecart > 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {ecart == null ? '—' : `${ecart > 0 ? '+' : ''}${formatMontant(ecart, unitePivot)}`}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {pdc.map((r) => (
                  <div key={r.cycleId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge label={r.cycleId} bg="bg-primary/10" text="text-primary" />
                      <span className="text-gray-600">{CYCLE_BUDGET_LABELS[r.cycleId]}</span>
                      {r.cycleId === dernier!.cycleId && (
                        <Badge label="Fait foi" bg="bg-emerald-100" text="text-emerald-700" />
                      )}
                    </div>
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {formatMontant(r.montant, unitePivot)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-accent" />
            <h4 className="font-semibold text-gray-900">Commentaires</h4>
            <span className="text-xs text-gray-400">({commentaires.length})</span>
          </div>

          <div className="flex gap-2 mb-4">
            <textarea
              value={nouveauCommentaire}
              onChange={(e) => setNouveauCommentaire(e.target.value)}
              onKeyDown={(e) => {
                // Entrée envoie, Maj+Entrée passe à la ligne — convention de
                // saisie des fils de discussion du module Discussions.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  envoyerCommentaire()
                }
              }}
              rows={2}
              placeholder="Écrire un commentaire sur ce projet..."
              className={`${champFormClass} resize-none text-sm`}
            />
            <Button onClick={envoyerCommentaire} disabled={!nouveauCommentaire.trim()} className="shrink-0 self-end">
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {commentaires.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun commentaire pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {commentaires.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 p-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">{nomAuteur(c.auteurId)}</span> ·{' '}
                      {formatDepuis(c.date)}
                    </p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{c.texte}</p>
                  </div>
                  {(isAdmin || c.auteurId === currentUser.id) && (
                    <button
                      onClick={() => supprimerCommentaireProjet(projet.id, c.id)}
                      title="Supprimer ce commentaire"
                      className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
