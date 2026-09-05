import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { ChampMontant } from '../ui/ChampMontant'
import { montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { PhaseEtatDiagram } from './PhaseEtatDiagram'
import { PhasesSuiviSection } from './PhasesSuiviSection'
import type { Projet } from '../../types/project'
import type { Action, ActionInput } from '../../types/action'
import { ecartJours, retardActuel } from '../../types/action'
import { useProjects } from '../../contexts/useProjects'
import { useAuth } from '../../contexts/useAuth'
import { formatDate } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'

const textareaClass =
  'w-full px-3 py-2 rounded-lg border text-sm bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition min-h-16'
const selectClass =
  'w-full px-3 py-2 rounded-lg border text-sm bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'

// Modifications de scope, rattachées à une phase (18/08/2026, demande
// explicite « la modification d'un scope est liée à une phase maintenant ») :
// un avenant de délai ou de coût touche une phase précise du projet, et c'est
// à cette phase qu'il faut pouvoir imputer les jours et le montant. Les
// modifications enregistrées avant ce changement restent sans phase — rien ne
// permet de la deviner après coup, et en inventer une fausserait le total de
// la phase désignée.
function ModificationsScopeSection({ projet }: { projet: Projet }) {
  const { montant: formatMontant } = useMontant()
  const { addModificationScope, removeModificationScope } = useProjects()
  const [showForm, setShowForm] = useState(false)
  const [phase, setPhase] = useState('')
  const [description, setDescription] = useState('')
  const [delai, setDelai] = useState('0')
  const [impact, setImpact] = useState('0')
  const [dateDemandee, setDateDemandee] = useState('')

  const phases = projet.suiviPhases.map((s) => s.phase)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    addModificationScope(projet.id, {
      phase: phase || null,
      description,
      delaiSupplementaireJours: Number(delai) || 0,
      impactFinancier: Number(impact) || 0,
      dateDemandee: dateDemandee || undefined,
    })
    setPhase('')
    setDescription('')
    setDelai('0')
    setImpact('0')
    setDateDemandee('')
    setShowForm(false)
  }

  const totalDelai = projet.modificationsScope.reduce((sum, m) => sum + m.delaiSupplementaireJours, 0)
  const totalImpact = projet.modificationsScope.reduce((sum, m) => sum + m.impactFinancier, 0)

  // Regroupées par phase, dans l'ordre des phases du projet ; les
  // modifications sans phase (antérieures au 18/08/2026, ou volontairement
  // transverses) ferment la liste sous leur propre intitulé.
  const groupes: { phase: string | null; libelle: string; lignes: typeof projet.modificationsScope }[] = [
    ...phases.map((p) => ({
      phase: p as string | null,
      libelle: p,
      lignes: projet.modificationsScope.filter((m) => m.phase === p),
    })),
    {
      phase: null,
      libelle: 'Sans phase rattachée',
      lignes: projet.modificationsScope.filter((m) => !m.phase || !phases.includes(m.phase)),
    },
  ].filter((g) => g.lignes.length > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">Modifications de scope</h4>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" />
          Ajouter une modification
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 mb-4">
          {phases.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Ce projet n'a aucune phase : la modification sera enregistrée sans rattachement. Créez une phase dans
              « Phases et activités » pour pouvoir l'y imputer.
            </p>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phase concernée</label>
              <select className={selectClass} value={phase} onChange={(e) => setPhase(e.target.value)} required>
                <option value="">Sélectionner…</option>
                {phases.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Délai supplémentaire (jours)" type="number" value={delai} onChange={(e) => setDelai(e.target.value)} />
            <ChampMontant
              label="Impact financier"
              devise={projet.devise}
              value={montantDepuisTexte(impact)}
              onChange={(v) => setImpact(texteDepuisMontant(v))}
            />
          </div>
          <Input
            label="Date de la demande (si différente de la saisie)"
            type="date"
            value={dateDemandee}
            onChange={(e) => setDateDemandee(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm">Ajouter</Button>
          </div>
        </form>
      )}

      {projet.modificationsScope.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune modification de scope enregistrée.</p>
      ) : (
        <>
          <div className="space-y-3 mb-3">
            {groupes.map((groupe) => {
              const delaiGroupe = groupe.lignes.reduce((sum, m) => sum + m.delaiSupplementaireJours, 0)
              const impactGroupe = groupe.lignes.reduce((sum, m) => sum + m.impactFinancier, 0)
              return (
                <div key={groupe.libelle} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-50 text-xs">
                    <span className={`font-semibold ${groupe.phase ? 'text-primary' : 'text-gray-500'}`}>
                      {groupe.libelle}
                    </span>
                    <span className="text-gray-500 tabular-nums">
                      +{delaiGroupe} j · {formatMontant(impactGroupe, projet.devise)}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {groupe.lignes.map((m) => (
                      <div key={m.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                        <div>
                          <p className="text-gray-900">{m.description}</p>
                          <p className="text-xs text-gray-400">
                            {formatDate(m.date)}
                            {m.dateDemandee && m.dateDemandee !== m.date && ` (demandée le ${formatDate(m.dateDemandee)})`}
                            {' · '}+{m.delaiSupplementaireJours} j
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`font-semibold ${m.impactFinancier > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {m.impactFinancier > 0 ? '+' : ''}
                            {formatMontant(m.impactFinancier, projet.devise)}
                          </span>
                          {/* Suppression (04/09/2026) : pas de confirmation à
                              part pour un avenant déjà visible en clair dans sa
                              propre liste, contrairement aux suppressions de
                              documents entiers (contrat, ligne navette…). */}
                          <button
                            onClick={() => removeModificationScope(projet.id, m.id)}
                            title="Supprimer cette modification"
                            className="text-gray-300 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-500">
              {projet.modificationsScope.length} modification{projet.modificationsScope.length > 1 ? 's' : ''} · +{totalDelai} j
            </span>
            <Badge
              label={totalImpact > 0 ? `Dépassement budgétaire de ${formatMontant(totalImpact, projet.devise)}` : `Dans l'enveloppe initiale (${formatMontant(totalImpact, projet.devise)})`}
              bg={totalImpact > 0 ? 'bg-red-100' : 'bg-green-100'}
              text={totalImpact > 0 ? 'text-red-700' : 'text-green-700'}
            />
          </div>
        </>
      )}
    </div>
  )
}

// Une action a un responsable, une date cible et une date réelle de clôture
// distincte (retour utilisateur) — remplace l'ancien plan d'action dérivé en
// texte libre des champs de SuiviPhaseCard ci-dessus (genererPlanAction).
function NewActionForm({
  projetId,
  origines,
  initialOrigine,
  initialCommentaire,
  onCreated,
  onCancel,
}: {
  projetId: string
  origines: string[]
  initialOrigine?: string
  initialCommentaire?: string
  onCreated: () => void
  onCancel: () => void
}) {
  const { addAction } = useProjects()
  const { users } = useAuth()
  const [origine, setOrigine] = useState(initialOrigine ?? origines[0] ?? 'Général')
  const [commentaire, setCommentaire] = useState(initialCommentaire ?? '')
  const [actionCorrective, setActionCorrective] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [dateCible, setDateCible] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const input: ActionInput = { origine, commentaire, actionCorrective, responsableId, dateCible }
    addAction(projetId, input)
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mb-4 border border-gray-100 rounded-xl p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Origine</label>
          <select className={selectClass} value={origine} onChange={(e) => setOrigine(e.target.value)}>
            {(origines.includes(origine) ? origines : [origine, ...origines]).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Responsable</label>
          <select className={selectClass} value={responsableId} onChange={(e) => setResponsableId(e.target.value)} required>
            <option value="">Sélectionner…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Commentaire / constat</label>
        <textarea className={textareaClass} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} required />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Action corrective (mitigation)</label>
        <textarea className={textareaClass} value={actionCorrective} onChange={(e) => setActionCorrective(e.target.value)} required />
      </div>
      <Input label="Date cible (deadline théorique)" type="date" value={dateCible} onChange={(e) => setDateCible(e.target.value)} required />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Annuler</Button>
        <Button type="submit" size="sm">Ajouter l'action</Button>
      </div>
    </form>
  )
}

function ActionCard({ projetId, action }: { projetId: string; action: Action }) {
  const { toggleAction } = useProjects()
  const { users } = useAuth()
  const responsable = users.find((u) => u.id === action.responsableId)?.name ?? '—'
  const ecart = ecartJours(action)
  const retard = retardActuel(action)

  return (
    <div className="border border-gray-100 rounded-xl p-3 text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge label={action.origine} bg="bg-gray-100" text="text-gray-700" />
          <Badge
            label={action.statut === 'ouverte' ? 'Ouverte' : 'Clôturée'}
            bg={action.statut === 'ouverte' ? 'bg-amber-100' : 'bg-green-100'}
            text={action.statut === 'ouverte' ? 'text-amber-700' : 'text-green-700'}
          />
          {action.statut === 'ouverte' && retard > 0 && <Badge label={`Retard ${retard} j`} bg="bg-red-100" text="text-red-700" />}
        </div>
        <button onClick={() => toggleAction(projetId, action.id)} className="text-xs font-semibold text-primary hover:underline shrink-0">
          {action.statut === 'ouverte' ? 'Clôturer' : 'Réouvrir'}
        </button>
      </div>
      <p className="text-gray-800">{action.commentaire}</p>
      <p className="text-gray-600 text-xs">
        <span className="text-gray-400">Action corrective : </span>
        {action.actionCorrective}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        <span>Responsable : {responsable}</span>
        <span>Cible : {formatDate(action.dateCible)}</span>
        {action.dateReelleCloture && (
          <span>
            Clôturée : {formatDate(action.dateReelleCloture)}
            {ecart !== null && ` (${ecart > 0 ? `+${ecart} j de retard` : ecart < 0 ? `${Math.abs(ecart)} j d'avance` : 'à date'})`}
          </span>
        )}
      </div>
    </div>
  )
}

// Commentaires propagés automatiquement depuis la Navette/Feuille de route
// (retour utilisateur : généralisation transverse) — visibles ici sans
// forcer une action complète (responsable/date cible) tant que personne ne
// l'a formalisée explicitement, pour éviter des actions fantômes.
function SignauxExternesSection({ projet, onConvertir }: { projet: Projet; onConvertir: (signalId: string, origine: string, commentaire: string) => void }) {
  const { retirerSignalExterne } = useProjects()
  const signaux = projet.signalesExternes ?? []

  if (signaux.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-500 mb-2">Signalé depuis d'autres modules</p>
      <div className="space-y-2">
        {signaux.map((s) => (
          <div key={s.id} className="border border-amber-100 bg-amber-50/50 rounded-xl p-3 text-sm flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Badge label={s.origine} bg="bg-amber-100" text="text-amber-700" />
                <span className="text-xs text-gray-400">{formatDate(s.date)}</span>
              </div>
              <p className="text-gray-800">{s.commentaire}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button onClick={() => onConvertir(s.id, s.origine, s.commentaire)} className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                Convertir en action
              </button>
              <button onClick={() => retirerSignalExterne(projet.id, s.id)} className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">
                Ignorer
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanActionSection({ projet }: { projet: Projet }) {
  const { retirerSignalExterne } = useProjects()
  const [showForm, setShowForm] = useState(false)
  const [prefill, setPrefill] = useState<{ signalId?: string; origine: string; commentaire: string } | null>(null)
  const actions = projet.planAction ?? []
  const origines = ['Général', ...projet.suiviPhases.map((s) => s.phase)]
  const ouvertes = actions.filter((a) => a.statut === 'ouverte')
  const cloturees = actions.filter((a) => a.statut === 'cloturee')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">Plan d'action</h4>
        {!showForm && (
          <button
            onClick={() => {
              setPrefill(null)
              setShowForm(true)
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter une action
          </button>
        )}
      </div>

      <SignauxExternesSection
        projet={projet}
        onConvertir={(signalId, origine, commentaire) => {
          setPrefill({ signalId, origine, commentaire })
          setShowForm(true)
        }}
      />

      {showForm && (
        <NewActionForm
          projetId={projet.id}
          origines={origines}
          initialOrigine={prefill?.origine}
          initialCommentaire={prefill?.commentaire}
          onCreated={() => {
            if (prefill?.signalId) retirerSignalExterne(projet.id, prefill.signalId)
            setShowForm(false)
            setPrefill(null)
          }}
          onCancel={() => {
            setShowForm(false)
            setPrefill(null)
          }}
        />
      )}

      {actions.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune action enregistrée.</p>
      ) : (
        <div className="space-y-4">
          {ouvertes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Ouvertes ({ouvertes.length})</p>
              <div className="space-y-2">
                {ouvertes.map((a) => (
                  <ActionCard key={a.id} projetId={projet.id} action={a} />
                ))}
              </div>
            </div>
          )}
          {cloturees.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Clôturées ({cloturees.length})</p>
              <div className="space-y-2">
                {cloturees.map((a) => (
                  <ActionCard key={a.id} projetId={projet.id} action={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SuiviTab({ projet }: { projet: Projet }) {
  return (
    <div className="space-y-8">
      <div>
        <h4 className="font-semibold text-gray-900 mb-4">État global du projet</h4>
        <PhaseEtatDiagram projet={projet} />
      </div>

      <PhasesSuiviSection projet={projet} />

      <PlanActionSection projet={projet} />

      <ModificationsScopeSection projet={projet} />
    </div>
  )
}
