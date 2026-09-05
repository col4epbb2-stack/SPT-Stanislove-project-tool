import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ChampMontant } from '../ui/ChampMontant'
import { SelecteurDevise } from '../ui/SelecteurDevise'
import { useDeviseParDefaut } from '../../lib/deviseParDefaut'
import { avecAjouts, decouperListe, montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { UNITE_KUSD } from '../../lib/unitesMontant'
import { useAuth } from '../../contexts/useAuth'
import { useProjects } from '../../contexts/useProjects'
import { CHAMPS, PLATEFORMES } from '../../data/referentiels'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { useNavette } from '../../contexts/useNavette'
import type { ProjectType, AvisType, DdmClasse, ServiceClient, ProjetInput } from '../../types/project'
import { TYPE_LABELS, AVIS_TYPE_LABELS, DDM_CLASSE_LABELS } from '../../types/project'
import type { Projet } from '../../types/project'
import type { RubriqueNiv1, RubriqueNiv2 } from '../../types/navette'
import { RUBRIQUE_NIV2_LABELS } from '../../types/navette'

interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  initialNom?: string
  initialAgentId?: string
  showNavetteFields?: boolean
  onCreated?: (projet: Projet) => void
}

const selectClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'

const SERVICE_CLIENTS: ServiceClient[] = ['Construction', 'Projet', 'Métal', 'EXP', 'Autre']
const NIV1_OPTIONS: RubriqueNiv1[] = ['OPEX', 'CAPEX']

export function NewProjectModal({
  isOpen,
  onClose,
  initialNom = '',
  initialAgentId,
  showNavetteFields = false,
  onCreated,
}: NewProjectModalProps) {
  const { currentUser, users } = useAuth()
  const { createProject } = useProjects()
  const { createLigne, linkToProject } = useNavette()
  const isAdmin = currentUser?.role === 'admin'
  const agents = users.filter((u) => u.role === 'agent')

  const [nom, setNom] = useState(initialNom)
  const [type, setType] = useState<ProjectType>('avis')
  const [avisNumero, setAvisNumero] = useState('')
  const [avisType, setAvisType] = useState<AvisType>('maintenance')
  const [ddmClasse, setDdmClasse] = useState<DdmClasse>('classe1')
  const [serviceClient, setServiceClient] = useState<ServiceClient>('Construction')
  const [budgetPrevisionnel, setBudgetPrevisionnel] = useState('')
  // Devise de la fiche : celle du système, et non un 'USD' écrit en dur
  // (21/08/2026) — la fiche créée depuis la navette doit naître dans la devise
  // que la page affiche. Le hook suit le pivot tant que rien n'est choisi.
  const { devise, setDevise } = useDeviseParDefaut()
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [contexte, setContexte] = useState('')
  const [risques, setRisques] = useState('')
  // Les mesures de mitigation suivent les risques dès la création (22/08/2026)
  // — c'est là qu'elles se pensent, pas après coup.
  const [mitigationRisques, setMitigationRisques] = useState('')
  const [opportunites, setOpportunites] = useState('')
  const [gainsAttendus, setGainsAttendus] = useState('')
  const [agentId, setAgentId] = useState(
    isAdmin ? initialAgentId ?? agents[0]?.id ?? '' : currentUser?.id ?? ''
  )
  const [workProgram, setWorkProgram] = useState(false)

  const [rubriqueNiv1, setRubriqueNiv1] = useState<RubriqueNiv1>('OPEX')
  const [rubriqueNiv2, setRubriqueNiv2] = useState<RubriqueNiv2>('GES')
  const [anneeBudget, setAnneeBudget] = useState(String(new Date().getFullYear()))
  const [codeOTP, setCodeOTP] = useState('')
  const { valeursDe } = useListesValeurs()
  // Les menus proposent le référentiel livré **plus** ce qu'un admin a déclaré
  // dans Paramètres › Listes de valeurs — sinon une valeur ajoutée là-bas
  // n'apparaîtrait qu'une fois la fiche créée, dans sa section Références.
  const champsProposes = avecAjouts([...CHAMPS], valeursDe('commun.champs'))
  const plateformesProposees = avecAjouts([...PLATEFORMES], valeursDe('commun.plateformes'))
  const [plateformes, setPlateformes] = useState('')
  const [champ, setChamp] = useState('')
  const [conso, setConso] = useState('0')
  const [serv, setServ] = useState('0')
  const [log, setLog] = useState('0')
  const [pers, setPers] = useState('0')
  const [autres, setAutres] = useState('0')

  const resetAndClose = () => {
    setNom('')
    setAvisNumero('')
    setBudgetPrevisionnel('')
    setDateDebut('')
    setDateFin('')
    setContexte('')
    setRisques('')
    setMitigationRisques('')
    setOpportunites('')
    setGainsAttendus('')
    setWorkProgram(false)
    setCodeOTP('')
    setAnneeBudget(String(new Date().getFullYear()))
    setChamp('')
    setPlateformes('')
    setConso('0')
    setServ('0')
    setLog('0')
    setPers('0')
    setAutres('0')
    onClose()
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentUser) return

    const resolvedAgentId = isAdmin ? agentId : currentUser.id

    const input: ProjetInput = {
      nom,
      type,
      avisNumero: type === 'avis' ? avisNumero : undefined,
      avisType: type === 'avis' ? avisType : undefined,
      ddmClasse: type === 'ddm' ? ddmClasse : undefined,
      serviceClient,
      budgetPrevisionnel: Number(budgetPrevisionnel) || 0,
      devise,
      dateDebut,
      dateFin,
      contexte,
      risques,
      mitigationRisques,
      opportunites,
      gainsAttendus,
      agentId: resolvedAgentId,
      workProgram,
      // Clés naturelles héritées de la ligne navette créée en même temps.
      codeOTP: showNavetteFields ? codeOTP : undefined,
      champ: showNavetteFields && champ ? champ : undefined,
      plateformes: decouperListe(plateformes),
    }
    const projet = createProject(input)

    if (showNavetteFields) {
      const ligne = await createLigne({
        rubriqueNiv1,
        rubriqueNiv2,
        anneeBudget: anneeBudget.trim() === '' ? undefined : Number(anneeBudget),
        codeOTP,
        champ: champ || undefined,
        libelle: nom,
        chargeAffaireId: resolvedAgentId,
        type,
        devise,
        workProgram,
        BU: {
          conso: Number(conso) || 0,
          serv: Number(serv) || 0,
          log: Number(log) || 0,
          pers: Number(pers) || 0,
          autres: Number(autres) || 0,
        },
      })
      await linkToProject(ligne.id, projet.id)
    }

    onCreated?.(projet)
    resetAndClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="Nouvelle fiche projet" maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nom du projet" value={nom} onChange={(e) => setNom(e.target.value)} required />

        {showNavetteFields && (
          <div className="space-y-4 border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ligne navette</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1.5">Rubrique</label>
                <select className={selectClass} value={rubriqueNiv1} onChange={(e) => setRubriqueNiv1(e.target.value as RubriqueNiv1)}>
                  {NIV1_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1.5">Programme</label>
                <select className={selectClass} value={rubriqueNiv2} onChange={(e) => setRubriqueNiv2(e.target.value as RubriqueNiv2)}>
                  {Object.entries(RUBRIQUE_NIV2_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
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
              {/* Trois valeurs, et trois seulement (22/08/2026) : le champ
                  était une saisie libre où entraient des plateformes. */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1.5">Champ (site)</label>
                <select className={selectClass} value={champ} onChange={(e) => setChamp(e.target.value)}>
                  <option value="">— Non renseigné —</option>
                  {champsProposes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">Plateforme(s)</label>
              <input
                className={selectClass}
                value={plateformes}
                onChange={(e) => setPlateformes(e.target.value)}
                placeholder="BDN, BDNM, TRM2… (séparées par une virgule)"
                list="plateformes-connues"
              />
              <datalist id="plateformes-connues">
                {plateformesProposees.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              <p className="text-xs text-gray-500 mt-1">
                Information distincte du champ : une affaire peut passer d'une plateforme à une autre en cours
                d'exécution.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1.5">Budget initial (BU) de la ligne navette</p>
              <div className="grid grid-cols-5 gap-2">
                {(
                  [
                    ['CONSO', conso, setConso],
                    ['SERV', serv, setServ],
                    ['LOG', log, setLog],
                    ['PERS', pers, setPers],
                    ['AUTRES', autres, setAutres],
                  ] as const
                ).map(([libelle, valeur, setValeur]) => (
                  <ChampMontant
                    key={libelle}
                    label={libelle}
                    devise={UNITE_KUSD.devise}
                    echelle={UNITE_KUSD.echelle}
                    value={montantDepuisTexte(valeur)}
                    onChange={(v) => setValeur(texteDepuisMontant(v))}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Type de projet</label>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Service client</label>
            <select className={selectClass} value={serviceClient} onChange={(e) => setServiceClient(e.target.value as ServiceClient)}>
              {SERVICE_CLIENTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {type === 'avis' && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Numéro de l'avis" value={avisNumero} onChange={(e) => setAvisNumero(e.target.value)} placeholder="AV-2026-000" />
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">Type d'avis</label>
              <select className={selectClass} value={avisType} onChange={(e) => setAvisType(e.target.value as AvisType)}>
                {Object.entries(AVIS_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {type === 'ddm' && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Classe DDM</label>
            <select className={selectClass} value={ddmClasse} onChange={(e) => setDdmClasse(e.target.value as DdmClasse)}>
              {Object.entries(DDM_CLASSE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input label="Date de début" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required />
          <Input label="Date de fin" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* La devise choisie ici est celle de toute la fiche (budget,
              commandes, factures) — le montant, lui, peut se saisir dans une
              autre devise, converti au taux du référentiel. */}
          <ChampMontant
            label="Budget prévisionnel"
            devise={devise}
            min={0}
            required
            value={montantDepuisTexte(budgetPrevisionnel)}
            onChange={(v) => setBudgetPrevisionnel(texteDepuisMontant(v))}
          />
          <SelecteurDevise label="Devise de la fiche" value={devise} onChange={setDevise} />
        </div>

        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Chargé de projet</label>
            <select className={selectClass} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Contexte du projet</label>
          <textarea className={`${selectClass} min-h-20`} value={contexte} onChange={(e) => setContexte(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Risques identifiés</label>
          <textarea className={`${selectClass} min-h-16`} value={risques} onChange={(e) => setRisques(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Mesures de mitigation</label>
          <textarea
            className={`${selectClass} min-h-16`}
            value={mitigationRisques}
            onChange={(e) => setMitigationRisques(e.target.value)}
            placeholder="Les actions mises en place pour maîtriser les risques ci-dessus"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Opportunités identifiées</label>
          <textarea className={`${selectClass} min-h-16`} value={opportunites} onChange={(e) => setOpportunites(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Gains attendus</label>
          <textarea className={`${selectClass} min-h-16`} value={gainsAttendus} onChange={(e) => setGainsAttendus(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={workProgram} onChange={(e) => setWorkProgram(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary/40" />
          Fait partie du Work Program (WP)
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={resetAndClose}>Annuler</Button>
          <Button type="submit" variant="primary">Créer la fiche projet</Button>
        </div>
      </form>
    </Modal>
  )
}
