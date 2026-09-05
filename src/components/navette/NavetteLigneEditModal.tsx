import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/useAuth'
import { useNavette } from '../../contexts/useNavette'
import type { BudgetPeriode, LigneNavette, RubriqueNiv1 } from '../../types/navette'
import { CYCLE_BUDGET_LABELS, cyclesDejaRevises, cyclesSuivantLeBU, memePeriode } from '../../types/navette'
import type { ProjectType } from '../../types/project'
import { TYPE_LABELS } from '../../types/project'
import { useRepartitionBudget } from './useRepartitionBudget'
import { RepartitionBudgetFields } from './RepartitionBudgetFields'
import { SelecteurDevise } from '../ui/SelecteurDevise'

// Correction d'une ligne navette déjà créée (21/08/2026, demande explicite de
// `doc/Navette commentaires.docx` : « je ne sais pas comment procéder pour
// modifier, par exemple, l'année afin de remplacer 2026 par 2027, ou encore
// pour modifier l'intitulé du projet »).
//
// Ce formulaire reprend **exactement les champs de la création**
// (NewNavetteLigneModal) : « les informations qui sont dans la feuille qui lui
// ont donné naissance ». Une seule différence, et pour une raison précise : le
// code OTP y est en lecture seule — il identifie le document Firestore.
//
// **23/08/2026, demande explicite** (« la modification d'une navette doit être
// comme lors de la création, remplace programme par type projet ») : le menu
// « Programme » (rubrique de niveau 2) est retiré. C'était le seul champ que
// la création ne demandait pas, donc le seul par lequel les deux formulaires
// divergeaient ; le type de projet, lui, est demandé des deux côtés. La valeur
// de `rubriqueNiv2` reste portée par la ligne et **réenregistrée telle
// quelle** — la retirer du formulaire ne l'efface pas. Conséquence assumée :
// elle n'est plus modifiable nulle part dans l'application (les lignes créées
// depuis l'app restent sur GES, celles du classeur gardent la leur).

interface NavetteLigneEditModalProps {
  ligne: LigneNavette
  isOpen: boolean
  onClose: () => void
}

const selectClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'

const NIV1_OPTIONS: RubriqueNiv1[] = ['OPEX', 'CAPEX']

export function NavetteLigneEditModal({ ligne, isOpen, onClose }: NavetteLigneEditModalProps) {
  const { users } = useAuth()
  const { updateLigne, arbitrages } = useNavette()
  const agents = users.filter((u) => u.role === 'agent')

  const [libelle, setLibelle] = useState(ligne.libelle)
  const [type, setType] = useState<ProjectType>(ligne.type)
  const [devise, setDevise] = useState(ligne.devise)
  const [rubriqueNiv1, setRubriqueNiv1] = useState<RubriqueNiv1>(ligne.rubriqueNiv1)
  const [anneeBudget, setAnneeBudget] = useState(ligne.anneeBudget != null ? String(ligne.anneeBudget) : '')
  const [champ, setChamp] = useState(ligne.champ ?? '')
  const [chargeAffaireId, setChargeAffaireId] = useState(ligne.chargeAffaireId)
  const [workProgram, setWorkProgram] = useState(ligne.workProgram)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const budget = useRepartitionBudget()
  // Budget N-1 (réalisé constaté) et N+1 (BUN1) — corrigibles indépendamment
  // du BU depuis le 04/09/2026, demande explicite. Ni l'un ni l'autre ne
  // déclenche de cascade : ce ne sont pas des révisions du budget de l'année
  // en cours.
  const realiseN1 = useRepartitionBudget()
  const bun1 = useRepartitionBudget()

  // Prérempli avec le BU en place, ventilation comprise — même mécanique que
  // `ArbitrageModal` : `useRepartitionBudget` n'expose que des setters, pas de
  // valeur initiale. Sans dépendances : la modale n'est montée qu'à
  // l'ouverture, donc l'effet ne joue qu'une fois par ouverture, et on ne veut
  // pas qu'il écrase la saisie en cours si la ligne change dans le contexte.
  useEffect(() => {
    const preremplir = (etat: typeof budget, periode: BudgetPeriode) => {
      etat.setBudgetInitial(String(periode.conso + periode.serv + periode.log + periode.pers + periode.autres))
      etat.setConso(String(periode.conso))
      etat.setServ(String(periode.serv))
      etat.setLog(String(periode.log))
      etat.setPers(String(periode.pers))
      etat.setAutres(String(periode.autres))
    }
    preremplir(budget, ligne.cycles.BU)
    preremplir(realiseN1, ligne.cycles.realiseN1)
    preremplir(bun1, ligne.cycles.BUN1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ce que la correction du BU va toucher, calculé sur la ligne réelle et
  // affiché avant l'enregistrement : la règle ne doit pas être une surprise.
  const dejaRevises = cyclesDejaRevises(arbitrages, ligne.id)
  const cyclesSuivis = cyclesSuivantLeBU(ligne.cycles, dejaRevises)
  const buModifie = !memePeriode(budget.repartition, ligne.cycles.BU)
  // Un cycle non modifié n'est jamais renvoyé (même règle que le BU) : sans
  // ça, une simple correction de libellé réécrirait realiseN1/BUN1 avec leur
  // propre valeur. Et sa validité (somme = total) n'est exigée que s'il a
  // été touché — sinon une ligne dont le réalisé N-1 n'a jamais été saisi
  // (montant à 0) bloquerait l'enregistrement de toute autre correction.
  const realiseN1Modifie = !memePeriode(realiseN1.repartition, ligne.cycles.realiseN1)
  const bun1Modifie = !memePeriode(bun1.repartition, ligne.cycles.BUN1)

  const soumissionValide =
    (!buModifie || budget.repartitionValide) &&
    (!realiseN1Modifie || realiseN1.repartitionValide) &&
    (!bun1Modifie || bun1.repartitionValide)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!soumissionValide) return

    setErreur(null)
    setEnCours(true)
    try {
      await updateLigne(ligne.id, {
        rubriqueNiv1,
        // Plus demandée par ce formulaire (ni par celui de création) : la
        // valeur de la ligne est renvoyée telle quelle, jamais réinventée.
        rubriqueNiv2: ligne.rubriqueNiv2,
        anneeBudget: anneeBudget.trim() === '' ? undefined : Number(anneeBudget),
        libelle: libelle.trim(),
        chargeAffaireId,
        champ: champ.trim() || undefined,
        type,
        devise,
        workProgram,
        // Un cycle inchangé n'est jamais renvoyé : sans ça, enregistrer une
        // simple correction de libellé réécrirait les cycles avec leur
        // propre valeur, pour rien.
        BU: buModifie ? budget.repartition : undefined,
        realiseN1: realiseN1Modifie ? realiseN1.repartition : undefined,
        BUN1: bun1Modifie ? bun1.repartition : undefined,
      })
      onClose()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La correction n'a pas pu être enregistrée.")
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Modifier — ${ligne.libelle}`} maxWidth="max-w-5xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Libellé" value={libelle} onChange={(e) => setLibelle(e.target.value)} required />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Type de projet</label>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <SelecteurDevise value={devise} onChange={setDevise} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Rubrique</label>
          <select
            className={selectClass}
            value={rubriqueNiv1}
            onChange={(e) => setRubriqueNiv1(e.target.value as RubriqueNiv1)}
          >
            {NIV1_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
          <Input label="Champ (site)" value={champ} onChange={(e) => setChamp(e.target.value)} placeholder="AGM, TRM, BDM..." />
        </div>

        {/* Le code OTP identifie le document Firestore : le modifier serait
            créer une autre ligne et abandonner celle-ci, avec tout ce qui
            pointe dessus (fiche projet, révisions, ligne de feuille de route).
            Affiché plutôt que masqué — c'est une information de la fiche. */}
        <div>
          <Input label="Code OTP" value={ligne.codeOTP} readOnly disabled />
          <p className="mt-1 text-xs text-gray-400">
            Le code OTP identifie la ligne dans la base et dans tout ce qui la référence (fiche projet, révisions,
            feuille de route) : il ne se modifie pas après la création.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Chargé d'affaires</label>
          <select className={selectClass} value={chargeAffaireId} onChange={(e) => setChargeAffaireId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <RepartitionBudgetFields {...budget} devise={devise} />

        {/* Ce que la correction du budget va réellement toucher. Le BU est
            semé sur les cycles PDC à la création : le corriger sans les
            corriger laisserait la ligne fausse partout sauf sur sa première
            ligne — mais il ne doit jamais réécrire une révision validée ni les
            montants propres d'une ligne reprise du classeur. */}
        {buModifie && (
          <div className="text-sm px-3 py-2 rounded-lg bg-amber-50 text-amber-800 space-y-1">
            <p>
              {cyclesSuivis.length > 0 ? (
                <>
                  Ce nouveau budget initial sera aussi appliqué à{' '}
                  <strong>{cyclesSuivis.map((c) => CYCLE_BUDGET_LABELS[c]).join(', ')}</strong>, qui portent encore le
                  budget initial à l'identique.
                </>
              ) : (
                <>Ce nouveau budget initial ne sera appliqué qu'au cycle BU.</>
              )}
            </p>
            {dejaRevises.length > 0 && (
              <p className="text-xs">
                Inchangés car révisés : {dejaRevises.map((c) => CYCLE_BUDGET_LABELS[c]).join(', ')}.
              </p>
            )}
          </div>
        )}

        {/* Budget N-1 et N+1 : deux cycles corrigibles indépendamment du BU,
            sans aucune cascade — un réalisé constaté d'un côté, un budget déjà
            existant (BUN1) de l'autre, jusqu'ici modifiable seulement en
            cascade depuis le BU (04/09/2026). */}
        <div className="border-t border-gray-100 pt-4 space-y-4">
          <RepartitionBudgetFields {...realiseN1} devise={devise} montantLabel={CYCLE_BUDGET_LABELS.realiseN1} />
          <RepartitionBudgetFields {...bun1} devise={devise} montantLabel={CYCLE_BUDGET_LABELS.BUN1} />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={workProgram}
            onChange={(e) => setWorkProgram(e.target.checked)}
            className="rounded border-gray-300 text-primary focus:ring-primary/40"
          />
          Fait partie du Work Program (WP)
        </label>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" loading={enCours}>
            Enregistrer les modifications
          </Button>
        </div>
      </form>
    </Modal>
  )
}
