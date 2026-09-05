import { useMemo, useState } from 'react'
import { CalendarPlus, CheckCircle2, ClipboardList, HardHat, MessageSquare, Plus, Trash2, UserRound } from 'lucide-react'
import type {
  LigneJournalTonnage,
  LignePersonnelTonnage,
  ParametresContratTonnage,
  RapportTonnage,
  StandByCauseTonnage,
} from '../../types/tonnageEchaf'
import type { DirectoryUser } from '../../types/user'
import { COMPTEURS_HSE, type CompteurHse } from '../../types/hebdoCrj'
import {
  demandesDuRapport,
  ecartStandByTonnage,
  estIncompressibleTonnage,
  hseDuRapport,
  personnesDuRapport,
  pointagesDuRapport,
  standByEstCoherentTonnage,
  standByParDefautTonnage,
  totalDesCausesTonnage,
} from '../../lib/contratTonnageRapports'
import { estApprouve, peutApprouverTonnage, peutCommenterTonnage } from '../../lib/contratTonnageWorkflow'
import { aujourdHui } from '../../lib/saisie'
import { formatDate, formatDepuis, formatNombre } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { EnteteSection } from '../ui/ChampsSaisie'
import { champFormClass } from '../ui/classes'

// Rapport journalier du module Tonnage échafaudage (03/09/2026, `doc/Suivi
// tonnage rev01.docx` §C — lot 3 de `doc/recueil-module-tonnage-rev01.md`).
//
// « L'utilisateur doit donc commencer par sélectionner le champ concerné
// avant de renseigner son rapport journalier » : c'est la première chose
// demandée ici, avant même la date. Une fois date + champ choisis, le rapport
// existant est retrouvé (ou créé) et son en-tête (rédacteur, société
// exécutante) devient éditable.
//
// **Il ne duplique aucune donnée.** Les demandes du Journal et les pointages
// du Suivi personnel de ce jour et ce champ sont listés en lecture — pas
// ressaisis — et deux boutons ouvrent les formulaires existants
// (`JournalTonnageSaisieForm` / `PersonnelTonnageSaisieForm`) déjà préremplis
// sur cette date et ce champ, exactement là où la saisie se fait réellement.

const texte = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))
const valeur = (v: string): number | null => {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export interface RapportTonnageSoumis {
  date: string
  champ: string
  redacteur: string | null
  societeExecutante: string | null
  standByTotalHeures: number | null
  standByCauses: StandByCauseTonnage[]
  hse: Record<CompteurHse, number>
}

export function RapportTonnageModal({
  isOpen,
  onClose,
  onEnregistrer,
  onApprouver,
  onCommenter,
  onOuvrirJournal,
  onOuvrirPersonnel,
  rapports,
  journal,
  personnel,
  parametres,
  champs,
  redacteurParDefaut,
  currentUser,
  rapportInitial,
}: {
  isOpen: boolean
  onClose: () => void
  onEnregistrer: (v: RapportTonnageSoumis) => Promise<void>
  /** §D « WORKLOW » (03/09/2026, lot 7) — approbation du Responsable Technique. */
  onApprouver: (id: string) => Promise<void>
  /** Commentaire d'un superviseur / gestionnaire du contrat, avec signalement d'erreur éventuel. */
  onCommenter: (id: string, texte: string, signalementErreur: boolean) => Promise<void>
  onOuvrirJournal: (date: string, champ: string) => void
  onOuvrirPersonnel: (date: string, champ: string) => void
  rapports: RapportTonnage[]
  journal: LigneJournalTonnage[]
  personnel: LignePersonnelTonnage[]
  parametres: ParametresContratTonnage
  champs: string[]
  redacteurParDefaut: string | null
  currentUser: DirectoryUser | null
  /** Ouvre directement sur ce rapport (liste des rapports → clic sur une ligne). */
  rapportInitial?: RapportTonnage | null
}) {
  const [date, setDate] = useState(aujourdHui())
  const [champ, setChamp] = useState('')
  const [redacteur, setRedacteur] = useState(redacteurParDefaut ?? '')
  const [societe, setSociete] = useState(parametres.societeExecutanteParDefaut ?? '')
  const [standByTotal, setStandByTotal] = useState('')
  const [causes, setCauses] = useState<StandByCauseTonnage[]>([])
  const [hse, setHse] = useState<Record<CompteurHse, string>>(() =>
    Object.fromEntries(COMPTEURS_HSE.map((c) => [c.cle, '0'])) as Record<CompteurHse, string>
  )
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState(false)
  // §D « WORKLOW » (lot 7) : approbation et commentaires.
  const [approbationEnCours, setApprobationEnCours] = useState(false)
  const [commentaireTexte, setCommentaireTexte] = useState('')
  const [commentaireErreur, setCommentaireErreur] = useState(false)
  const [commentaireEnCours, setCommentaireEnCours] = useState(false)
  // Le couple (date, champ) déjà chargé pour le stand-by et le HSE — voir
  // plus bas, où il est comparé à chaque rendu.
  const [chargePour, setChargePour] = useState<string | null>(null)

  // Reset à l'ouverture, pendant le rendu (même pattern que les autres
  // formulaires du module — pas de useEffect en cascade).
  const [dejaOuvert, setDejaOuvert] = useState(false)
  if (isOpen && !dejaOuvert) {
    setDejaOuvert(true)
    setErreur(null)
    setSucces(false)
    if (rapportInitial) {
      setDate(rapportInitial.date)
      setChamp(rapportInitial.champ)
      setRedacteur(rapportInitial.redacteur ?? redacteurParDefaut ?? '')
      setSociete(rapportInitial.societeExecutante ?? parametres.societeExecutanteParDefaut ?? '')
    } else {
      setDate(aujourdHui())
      setChamp('')
      setRedacteur(redacteurParDefaut ?? '')
      setSociete(parametres.societeExecutanteParDefaut ?? '')
    }
  } else if (!isOpen && dejaOuvert) {
    setDejaOuvert(false)
    setChargePour(null)
  }

  // Le rapport existant pour ce couple (date, champ), pour dire à l'écran
  // qu'enregistrer va le mettre à jour plutôt qu'en créer un nouveau.
  const rapportExistant = useMemo(
    () => (champ ? (rapports.find((r) => r.date === date && r.champ === champ) ?? null) : null),
    [rapports, date, champ]
  )

  // Stand-by et HSE se rechargent à chaque changement de (date, champ) — pas
  // seulement à l'ouverture de la modale, puisque le champ se choisit à
  // l'intérieur d'elle (03/09/2026, lot 4 — même mécanique que le rapport
  // peinture, 27/08/2026, qui pose son `chargePour` pendant le rendu et non
  // dans un effet).
  const clefChargement = champ ? `${date}__${champ}` : null
  if (isOpen && clefChargement && clefChargement !== chargePour) {
    setChargePour(clefChargement)
    setStandByTotal(texte(rapportExistant?.standByTotalHeures))
    setCauses(standByParDefautTonnage(parametres, champ, rapportExistant?.standByCauses ?? []))
    const h = hseDuRapport(rapportExistant)
    setHse(Object.fromEntries(COMPTEURS_HSE.map((c) => [c.cle, String(h[c.cle])])) as Record<CompteurHse, string>)
    setCommentaireTexte('')
    setCommentaireErreur(false)
  }

  const demandes = useMemo(() => (champ ? demandesDuRapport(journal, date, champ) : []), [journal, date, champ])
  const pointages = useMemo(() => (champ ? pointagesDuRapport(personnel, date, champ) : []), [personnel, date, champ])
  const personnes = useMemo(() => personnesDuRapport(pointages), [pointages])

  const ecart = ecartStandByTonnage(valeur(standByTotal), causes)
  const coherent = standByEstCoherentTonnage(valeur(standByTotal), causes)

  // §D « WORKLOW » (lot 7) : un rapport approuvé n'est plus modifiable que
  // par qui pouvait l'approuver (Responsable Technique ou admin) —
  // « validation définitive ». Les commentaires, eux, restent ouverts : ce
  // n'est pas ce que le document verrouille.
  const approuve = estApprouve(rapportExistant ?? {})
  const peutApprouver = peutApprouverTonnage(currentUser)
  const peutCommenter = peutCommenterTonnage(currentUser)
  const verrouille = approuve && !peutApprouver

  const approuverRapport = async () => {
    if (!rapportExistant) return
    setApprobationEnCours(true)
    setErreur(null)
    try {
      await onApprouver(rapportExistant.id)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le rapport n'a pas pu être approuvé.")
    } finally {
      setApprobationEnCours(false)
    }
  }

  const envoyerCommentaire = async () => {
    if (!rapportExistant || !commentaireTexte.trim()) return
    setCommentaireEnCours(true)
    setErreur(null)
    try {
      await onCommenter(rapportExistant.id, commentaireTexte.trim(), commentaireErreur)
      setCommentaireTexte('')
      setCommentaireErreur(false)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le commentaire n'a pas pu être enregistré.")
    } finally {
      setCommentaireEnCours(false)
    }
  }

  const enregistrer = async () => {
    if (!champ) {
      setErreur('Choisissez un champ avant d’enregistrer.')
      return
    }
    setEnregistrement(true)
    setErreur(null)
    try {
      await onEnregistrer({
        date,
        champ,
        redacteur: redacteur.trim() || null,
        societeExecutante: societe.trim() || null,
        standByTotalHeures: valeur(standByTotal),
        standByCauses: causes,
        hse: Object.fromEntries(COMPTEURS_HSE.map((c) => [c.cle, Number(hse[c.cle]) || 0])) as Record<
          CompteurHse,
          number
        >,
      })
      setSucces(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le rapport n'a pas pu être enregistré.")
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={champ ? `Rapport ${formatDate(date)} — ${champ}` : 'Rapport journalier'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div>
          <EnteteSection
            titre="Champ et date"
            aide="Le champ concerné se choisit avant tout le reste — c'est lui qui situe le rapport."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-500" htmlFor="rapport-tonnage-champ">
                Champ
              </label>
              <select
                id="rapport-tonnage-champ"
                value={champ}
                onChange={(e) => setChamp(e.target.value)}
                className={champFormClass}
              >
                <option value="">— Choisir —</option>
                {champs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Date du rapport" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {champ && (
          <>
            <div>
              <EnteteSection titre="Identification du rapport" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <Input
                  label="Rédacteur du rapport"
                  value={redacteur}
                  onChange={(e) => setRedacteur(e.target.value)}
                  placeholder="Nom de la personne qui réalise le suivi"
                  disabled={verrouille}
                />
                <Input
                  label="Société exécutante"
                  value={societe}
                  onChange={(e) => setSociete(e.target.value)}
                  placeholder="GMI"
                  disabled={verrouille}
                />
              </div>
              {rapportExistant && (
                <p className="text-xs text-gray-400 mt-2">Ce rapport existe déjà — l'enregistrer met à jour son en-tête.</p>
              )}
              {rapportExistant?.saisiPar && (
                <p className="text-xs text-gray-400 mt-1">
                  Saisi par {rapportExistant.saisiPar}
                  {rapportExistant.saisiLe ? ` · ${formatDepuis(rapportExistant.saisiLe)}` : ''}.
                </p>
              )}
              {verrouille && (
                <p className="text-xs text-amber-700 mt-2">
                  Ce rapport est approuvé — seul le Responsable Technique ou un admin peut encore le modifier.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-gray-400" />
                    Demandes du jour ({formatNombre(demandes.length)})
                  </p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onOuvrirJournal(date, champ)}>
                    <HardHat className="w-3.5 h-3.5 mr-1" />
                    Ajouter
                  </Button>
                </div>
                {demandes.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucune demande saisie ce jour-là sur ce champ.</p>
                ) : (
                  <ul className="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto">
                    {demandes.map((d) => (
                      <li key={d.id} className="truncate">
                        {d.numeroDemande ?? '—'} · {d.projet ?? 'Projet non renseigné'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <UserRound className="w-4 h-4 text-gray-400" />
                    Personnel du jour ({formatNombre(pointages.length)})
                  </p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onOuvrirPersonnel(date, champ)}>
                    <CalendarPlus className="w-3.5 h-3.5 mr-1" />
                    Ajouter
                  </Button>
                </div>
                {personnes.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucun pointage ce jour-là sur ce champ.</p>
                ) : (
                  <ul className="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto">
                    {personnes.map((p) => (
                      <li key={p.nom} className="truncate">
                        {p.nom} — {p.profils.join(', ') || '—'}
                        {p.projets.length > 0 ? ` · ${p.projets.join(', ')}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* --- §J/§K : stand-by, journalier et non par demande -------- */}
            <div>
              <EnteteSection
                titre="Stand-by du jour"
                aide="Le stand-by se déclare pour la journée, sur ce champ — pas ligne par ligne pour une demande. Le total des causes doit être égal au total déclaré."
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                <Input
                  label="Total déclaré (h)"
                  type="number"
                  min="0"
                  step="0.5"
                  value={standByTotal}
                  onChange={(e) => setStandByTotal(e.target.value)}
                  disabled={verrouille}
                />
                <div>
                  <span className="block text-sm font-medium text-gray-500 mb-1.5">Total des causes</span>
                  <p
                    className={`px-4 py-3 rounded-xl border text-sm ${
                      coherent ? 'border-gray-100 bg-gray-50 text-gray-600' : 'border-amber-300 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {formatNombre(totalDesCausesTonnage(causes), 2)} h
                  </p>
                </div>
                {ecart !== null && Math.abs(ecart) > 1e-9 && (
                  <p className="text-xs text-amber-700 self-end pb-3">
                    Écart de {formatNombre(ecart, 2)} h — le rapport ne peut pas être enregistré tant que les deux
                    totaux diffèrent.
                  </p>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {causes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={c.cause}
                      onChange={(e) => setCauses((x) => x.map((y, j) => (j === i ? { ...y, cause: e.target.value } : y)))}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      disabled={verrouille}
                    >
                      <option value="">Choisir une cause…</option>
                      {parametres.causesStandBy.map((cc) => (
                        <option key={cc} value={cc}>
                          {cc}
                        </option>
                      ))}
                      {/* Une cause déjà enregistrée mais absente du référentiel
                          reste sélectionnable : la retirer du menu effacerait
                          silencieusement une saisie. */}
                      {c.cause && !parametres.causesStandBy.includes(c.cause) && (
                        <option value={c.cause}>{c.cause}</option>
                      )}
                    </select>
                    {estIncompressibleTonnage(c.cause) && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0"
                        title="Temps qui ne peut pas être optimisé — pause repas, contraintes obligatoires du contrat"
                      >
                        Incompressible
                      </span>
                    )}
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Heures"
                      value={texte(c.heures)}
                      onChange={(e) =>
                        setCauses((x) => x.map((y, j) => (j === i ? { ...y, heures: valeur(e.target.value) } : y)))
                      }
                      className="w-28 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      disabled={verrouille}
                    />
                    <button
                      type="button"
                      onClick={() => setCauses((x) => x.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                      aria-label="Retirer cette cause"
                      disabled={verrouille}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {parametres.causesStandBy.length === 0 && (
                  <p className="text-xs text-amber-600">
                    Aucune cause déclarée dans Paramètres › Tonnage échafaudage — la ventilation ne peut pas être
                    saisie.
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCauses((x) => [...x, { cause: '', heures: null }])}
                  disabled={verrouille}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Ajouter une cause
                </Button>
              </div>
            </div>

            {/* --- §22 : HSE journalier — mêmes 6 compteurs que le CRJ ---- */}
            <div>
              <EnteteSection
                titre="HSE du jour"
                aide="Mêmes compteurs que les autres suivis de l'application (CRJ), à la maille du rapport — un total par jour et par champ."
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                {COMPTEURS_HSE.map((c) => (
                  <div key={c.cle}>
                    <label className="block text-xs text-gray-500 mb-1" htmlFor={`rapport-tonnage-hse-${c.cle}`}>
                      {c.label}
                    </label>
                    <input
                      id={`rapport-tonnage-hse-${c.cle}`}
                      type="number"
                      min="0"
                      value={hse[c.cle]}
                      onChange={(e) => setHse((h) => ({ ...h, [c.cle]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                      disabled={verrouille}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* --- §D « WORKLOW » : approbation et commentaires ---------- */}
            <div>
              <EnteteSection
                titre="Vérification et approbation"
                aide="Le Responsable Technique vérifie et approuve le compte rendu ; superviseurs et gestionnaires du contrat peuvent commenter et signaler des erreurs."
              />
              <div className="mt-3">
                {approuve && rapportExistant?.validation ? (
                  <p className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Approuvé par {rapportExistant.validation.approuvePar} ·{' '}
                    {formatDepuis(rapportExistant.validation.approuveLe)}
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-500">Pas encore approuvé.</p>
                    {peutApprouver && (
                      <Button
                        type="button"
                        size="sm"
                        loading={approbationEnCours}
                        disabled={!rapportExistant}
                        title={!rapportExistant ? "Enregistrez d'abord le rapport avant de l'approuver." : undefined}
                        onClick={() => void approuverRapport()}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Approuver ce rapport
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  Commentaires ({formatNombre(rapportExistant?.commentaires?.length ?? 0)})
                </p>
                {!rapportExistant?.commentaires?.length ? (
                  <p className="text-xs text-gray-400">Aucun commentaire.</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {rapportExistant.commentaires.map((c) => (
                      <li
                        key={c.id}
                        className={`text-sm rounded-lg border px-3 py-2 ${
                          c.signalementErreur ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-medium text-gray-900">{c.auteur}</span>
                          <span className="text-xs text-gray-400">{formatDepuis(c.creeLe)}</span>
                        </div>
                        {c.signalementErreur && (
                          <span className="inline-block text-[11px] font-medium text-red-700 mb-1">
                            Erreur signalée
                          </span>
                        )}
                        <p className="text-gray-700">{c.texte}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {peutCommenter && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={commentaireTexte}
                      onChange={(e) => setCommentaireTexte(e.target.value)}
                      placeholder={
                        rapportExistant
                          ? 'Ajouter un commentaire…'
                          : "Enregistrez d'abord le rapport pour pouvoir commenter."
                      }
                      disabled={!rapportExistant}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={commentaireErreur}
                          onChange={(e) => setCommentaireErreur(e.target.checked)}
                          disabled={!rapportExistant}
                        />
                        Signaler une erreur ou une incohérence
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        loading={commentaireEnCours}
                        disabled={!rapportExistant || !commentaireTexte.trim()}
                        onClick={() => void envoyerCommentaire()}
                      >
                        Envoyer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        {succes && !enregistrement && <p className="text-xs text-emerald-600">Rapport enregistré.</p>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          <Button
            type="button"
            loading={enregistrement}
            disabled={!champ || !coherent || verrouille}
            onClick={() => void enregistrer()}
          >
            Enregistrer le rapport
          </Button>
        </div>
      </div>
    </Modal>
  )
}
