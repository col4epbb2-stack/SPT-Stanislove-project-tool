import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { HardHat, AlertTriangle, ShieldAlert, Plus, Pencil } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { Projet } from '../../types/project'
import type { SaisieHSEMensuelle, SaisieHSEMensuelleInput } from '../../types/hse'
import {
  MOIS_LABELS_HSE,
  OBJECTIF_LTIF,
  OBJECTIF_TRIR,
  OBJECTIF_HPIF,
  OBJECTIF_ANOMALIES_MENSUEL,
  OBJECTIF_AUDITS_MENSUEL,
  cumulYTD,
  ltif,
  trir,
  hpif,
} from '../../types/hse'
import { useProjects } from '../../contexts/useProjects'
import { useResolveur } from '../../contexts/useResolveur'
import { clesJournalHebdo } from '../../lib/liaisonCles'
import { chargerJournalHebdoCrjPartage } from '../../lib/journauxTerrainCache'
import { deriveIndicateursHSE } from '../../lib/hebdoCrjEngine'
import type { LigneJournalHebdo } from '../../types/hebdoCrj'
import { formatDate } from '../../lib/format'

const STAT_COLORS = {
  primary: { bg: 'bg-primary/10', text: 'text-primary' },
  green: { bg: 'bg-green-100', text: 'text-green-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700' },
  red: { bg: 'bg-red-100', text: 'text-red-700' },
} as const

const selectClass =
  'w-full px-3 py-2 rounded-lg border text-sm bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'

// Exportés pour la synthèse HSE globale du portefeuille (HSEPage) — même
// présentation Mois/YTD (Indicateur | Objectif | Valeur | Écart) que par
// projet, juste alimentée par des totaux portefeuille plutôt qu'un seul
// projet.
export function StatCard({ icon: Icon, label, value, color = 'primary' }: { icon: typeof HardHat; label: string; value: string | number; color?: keyof typeof STAT_COLORS }) {
  const styles = STAT_COLORS[color]
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${styles.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${styles.text}`} />
        </div>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}

function arrondi(v: number): number {
  return Math.round(v * 100) / 100
}

// Bloc Mois ou YTD (classeur de référence : Indicateur | Objectif | Valeur |
// Écart) — écart positif = dépassement de l'objectif, coloré en rouge.
export function BlocIndicateurs({
  titre,
  lignes,
}: {
  titre: string
  lignes: { label: string; objectif: number; valeur: number; unite: string }[]
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2">{titre}</p>
      <div className="overflow-x-auto border border-gray-100 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-400">
              <th className="px-3 py-1.5 font-medium">Indicateur</th>
              <th className="px-3 py-1.5 font-medium text-right">Objectif</th>
              <th className="px-3 py-1.5 font-medium text-right">Valeur</th>
              <th className="px-3 py-1.5 font-medium text-right">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.map((l) => {
              const ecart = arrondi(l.valeur - l.objectif)
              return (
                <tr key={l.label}>
                  <td className="px-3 py-1.5 text-gray-900">{l.label}</td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{l.objectif} {l.unite}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-900">{arrondi(l.valeur)} {l.unite}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${ecart > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {ecart > 0 ? '+' : ''}
                    {ecart}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SaisieHSEForm({
  projet,
  saisie,
  onDone,
}: {
  projet: Projet
  saisie?: SaisieHSEMensuelle
  onDone: () => void
}) {
  const { saisirHSEMensuel } = useProjects()
  const maintenant = new Date()
  const [annee, setAnnee] = useState(String(saisie?.annee ?? maintenant.getFullYear()))
  const [mois, setMois] = useState(String(saisie?.mois ?? maintenant.getMonth() + 1))
  const [heuresTravaillees, setHeuresTravaillees] = useState(String(saisie?.heuresTravaillees ?? 0))
  const [fat, setFat] = useState(String(saisie?.fat ?? 0))
  const [lti, setLti] = useState(String(saisie?.lti ?? 0))
  const [chse, setChse] = useState(String(saisie?.chse ?? 0))
  const [mtc, setMtc] = useState(String(saisie?.mtc ?? 0))
  const [fac, setFac] = useState(String(saisie?.fac ?? 0))
  const [hpi, setHpi] = useState(String(saisie?.hpi ?? 0))
  const [anomalies, setAnomalies] = useState(String(saisie?.anomalies ?? 0))
  const [audits, setAudits] = useState(String(saisie?.audits ?? 0))

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const input: SaisieHSEMensuelleInput = {
      annee: Number(annee),
      mois: Number(mois),
      heuresTravaillees: Number(heuresTravaillees) || 0,
      fat: Number(fat) || 0,
      lti: Number(lti) || 0,
      chse: Number(chse) || 0,
      mtc: Number(mtc) || 0,
      fac: Number(fac) || 0,
      hpi: Number(hpi) || 0,
      anomalies: Number(anomalies) || 0,
      audits: Number(audits) || 0,
    }
    saisirHSEMensuel(projet.id, input)
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mb-4 border border-gray-100 rounded-xl p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Année</label>
          <Input type="number" value={annee} onChange={(e) => setAnnee(e.target.value)} disabled={!!saisie} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Mois</label>
          <select value={mois} onChange={(e) => setMois(e.target.value)} className={selectClass} disabled={!!saisie}>
            {MOIS_LABELS_HSE.map((label, i) => (
              <option key={label} value={i + 1}>{label}</option>
            ))}
          </select>
        </div>
        <Input label="Heures travaillées" type="number" value={heuresTravaillees} onChange={(e) => setHeuresTravaillees(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Input label="FAT (accident fatal)" type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
        <Input label="LTI (arrêt de travail)" type="number" value={lti} onChange={(e) => setLti(e.target.value)} />
        <Input label="CHSE" type="number" value={chse} onChange={(e) => setChse(e.target.value)} />
        <Input label="MTC (traitement médical)" type="number" value={mtc} onChange={(e) => setMtc(e.target.value)} />
        <Input label="FAC (premier soin)" type="number" value={fac} onChange={(e) => setFac(e.target.value)} />
        <Input label="HPI (hauts potentiels)" type="number" value={hpi} onChange={(e) => setHpi(e.target.value)} />
        <Input label="Anomalies HSE" type="number" value={anomalies} onChange={(e) => setAnomalies(e.target.value)} />
        <Input label="Audits HSE" type="number" value={audits} onChange={(e) => setAudits(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button type="submit" size="sm">Enregistrer</Button>
      </div>
    </form>
  )
}

// Fusion des deux sources HSE (audit CDS) : sous la saisie manuelle
// ci-dessus, les indicateurs dérivés du vrai journal CRJ (deriveIndicateursHSE,
// déjà utilisé portefeuille par TableauDeBordPage/SuiviHebdoCrjPage) mais
// résolus à cette fiche projet précise via le moteur de liaison — lecture
// seule, comme le fait déjà TravauxTerrainTab pour Tonnage/Peinture. Ne
// remplace jamais la saisie manuelle : les deux restent visibles côte à côte.
function IndicateursHSEDerives({ projet }: { projet: Projet }) {
  const resolveur = useResolveur()
  const [journal, setJournal] = useState<LigneJournalHebdo[] | null>(null)

  useEffect(() => {
    chargerJournalHebdoCrjPartage().then(setJournal)
  }, [])

  const lignes = useMemo(() => {
    if (!journal) return null
    return journal.filter((l) => resolveur.resoudre('suivi-hebdo-crj', clesJournalHebdo(l))?.projetId === projet.id)
  }, [journal, resolveur, projet.id])

  if (!journal) return <p className="text-xs text-gray-400 mt-4">Résolution du journal CRJ…</p>
  if (lignes && lignes.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-4">
        Journal CRJ ({journal.length} lignes) : aucune résolue automatiquement à ce projet — le journal porte peu de
        clés de liaison exploitables en l'état sur cette fiche (doc §2.3).
      </p>
    )
  }
  if (!lignes) return null

  const derive = deriveIndicateursHSE(lignes)

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-1">
        <h5 className="text-sm font-semibold text-gray-900">Indicateurs dérivés du CRJ</h5>
        <Badge label={`${lignes.length} ligne${lignes.length > 1 ? 's' : ''}`} bg="bg-blue-100" text="text-blue-700" />
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Résolu automatiquement depuis le journal CRJ (Compte Rendu Journalier) — lecture seule, distinct de la saisie
        manuelle ci-dessus. CHSE/MTC/Audits HSE n'ont pas d'équivalent dans ce journal.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={HardHat} label="Heures travaillées (CRJ)" value={derive.heuresTravaillees.toLocaleString('fr-FR')} />
        <StatCard icon={AlertTriangle} label="FAT + LTI (CRJ)" value={derive.fat + derive.lti} color={derive.fat + derive.lti > 0 ? 'red' : 'green'} />
        <StatCard icon={ShieldAlert} label="HPI + FAC (CRJ)" value={derive.hpi + derive.fac} color={derive.hpi + derive.fac > 0 ? 'amber' : 'green'} />
      </div>
    </div>
  )
}

// readOnly (01/08/2026, demande explicite) : le HSE affiché dans la fiche
// projet (ProjectDetailPage) est de la consultation, pas un point de saisie
// — la saisie reste centralisée sur la page HSE de la sidebar (HSEPage),
// seul appelant qui laisse readOnly à false (par défaut).
export function HSETab({ projet, readOnly = false }: { projet: Projet; readOnly?: boolean }) {
  const { addActionHSE, toggleActionHSE } = useProjects()
  const [showForm, setShowForm] = useState(false)
  const [editionId, setEditionId] = useState<string | null>(null)
  const [showActionForm, setShowActionForm] = useState(false)
  const [description, setDescription] = useState('')

  const saisies = [...projet.hse].sort((a, b) => a.annee - b.annee || a.mois - b.mois)
  const derniere = saisies[saisies.length - 1]
  const enEdition = editionId ? saisies.find((s) => s.id === editionId) : undefined

  const handleAddAction = (e: FormEvent) => {
    e.preventDefault()
    addActionHSE(projet.id, description)
    setDescription('')
    setShowActionForm(false)
  }

  const ouvertes = projet.actionsHSE.filter((a) => a.statut === 'ouverte')
  const cloturees = projet.actionsHSE.filter((a) => a.statut === 'cloturee')

  const ytd = derniere ? cumulYTD(projet.hse, derniere.annee, derniere.mois) : null

  return (
    <div className="space-y-6">
      {readOnly && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
          Lecture seule — la saisie HSE se fait depuis la page HSE (menu latéral).
        </p>
      )}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">Indicateurs HSE</h4>
          {!readOnly && !showForm && !enEdition && (
            <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" />
              Ajouter une saisie mensuelle
            </button>
          )}
        </div>

        {!readOnly && showForm && <SaisieHSEForm projet={projet} onDone={() => setShowForm(false)} />}
        {!readOnly && enEdition && <SaisieHSEForm projet={projet} saisie={enEdition} onDone={() => setEditionId(null)} />}

        {projet.ancienSnapshotHSE && (
          <div className="mb-4 border border-amber-100 bg-amber-50/50 rounded-xl p-3 text-sm">
            <p className="text-xs font-semibold text-amber-700 mb-1.5">
              Ancien indicateur (avant migration vers le modèle mensuel du 27/07/2026) — non converti, conservé pour référence
            </p>
            <p className="text-xs text-gray-600">
              {projet.ancienSnapshotHSE.heuresTravaillees.toLocaleString('fr-FR')} heures travaillées ·{' '}
              {projet.ancienSnapshotHSE.nombreIncidents} incident(s) (fatal + arrêt de travail confondus) ·{' '}
              {projet.ancienSnapshotHSE.nombreQuasiAccidents} quasi-accident(s) (hauts potentiels + premiers soins confondus) ·{' '}
              {projet.ancienSnapshotHSE.joursArretCumules} jour(s) d'arrêt cumulés
            </p>
          </div>
        )}

        {!derniere ? (
          <p className="text-sm text-gray-400">Aucune saisie HSE mensuelle enregistrée.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Dernière saisie : {MOIS_LABELS_HSE[derniere.mois - 1]} {derniere.annee} · {derniere.heuresTravaillees.toLocaleString('fr-FR')} heures travaillées
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <BlocIndicateurs
                titre={`Mois — ${MOIS_LABELS_HSE[derniere.mois - 1]} ${derniere.annee}`}
                lignes={[
                  { label: 'LTIF', objectif: OBJECTIF_LTIF, valeur: ltif(derniere), unite: '' },
                  { label: 'TRIR', objectif: OBJECTIF_TRIR, valeur: trir(derniere), unite: '' },
                  { label: 'HPIF', objectif: OBJECTIF_HPIF, valeur: hpif(derniere), unite: '' },
                  { label: 'Anomalies', objectif: OBJECTIF_ANOMALIES_MENSUEL, valeur: derniere.anomalies, unite: '' },
                  { label: 'Audits HSE', objectif: OBJECTIF_AUDITS_MENSUEL, valeur: derniere.audits, unite: '' },
                ]}
              />
              {ytd && (
                <BlocIndicateurs
                  titre={`YTD ${derniere.annee} (jusqu'à ${MOIS_LABELS_HSE[derniere.mois - 1]})`}
                  lignes={[
                    { label: 'LTIF', objectif: OBJECTIF_LTIF, valeur: ltif(ytd), unite: '' },
                    { label: 'TRIR', objectif: OBJECTIF_TRIR, valeur: trir(ytd), unite: '' },
                    { label: 'HPIF', objectif: OBJECTIF_HPIF, valeur: hpif(ytd), unite: '' },
                    { label: 'Anomalies (moy.)', objectif: OBJECTIF_ANOMALIES_MENSUEL, valeur: ytd.anomaliesMoyenne, unite: '' },
                    { label: 'Audits HSE (moy.)', objectif: OBJECTIF_AUDITS_MENSUEL, valeur: ytd.auditsMoyenne, unite: '' },
                  ]}
                />
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Historique des saisies</p>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {saisies.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-gray-900">{MOIS_LABELS_HSE[s.mois - 1]} {s.annee}</span>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>FAT {s.fat} · LTI {s.lti} · CHSE {s.chse} · MTC {s.mtc} · FAC {s.fac} · HPI {s.hpi}</span>
                      {!readOnly && (
                        <button onClick={() => setEditionId(s.id)} title="Modifier" className="text-gray-400 hover:text-primary">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <IndicateursHSEDerives projet={projet} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">Actions HSE ({ouvertes.length} ouverte{ouvertes.length > 1 ? 's' : ''} · {cloturees.length} clôturée{cloturees.length > 1 ? 's' : ''})</h4>
          {!readOnly && !showActionForm && (
            <button onClick={() => setShowActionForm(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" />
              Ajouter une action
            </button>
          )}
        </div>

        {!readOnly && showActionForm && (
          <form onSubmit={handleAddAction} className="flex flex-wrap items-end gap-3 mb-4">
            <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required className="flex-1 min-w-48" />
            <Button type="submit" size="sm">Ajouter</Button>
          </form>
        )}

        {projet.actionsHSE.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune action HSE enregistrée.</p>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {projet.actionsHSE.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
                <div>
                  <p className={a.statut === 'cloturee' ? 'text-gray-400 line-through' : 'text-gray-900'}>{a.description}</p>
                  <p className="text-xs text-gray-400">{formatDate(a.dateCreation)}</p>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => toggleActionHSE(projet.id, a.id)}
                    className={`shrink-0 text-xs font-semibold hover:underline ${a.statut === 'ouverte' ? 'text-primary' : 'text-gray-400'}`}
                  >
                    {a.statut === 'ouverte' ? 'Clôturer' : 'Rouvrir'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
