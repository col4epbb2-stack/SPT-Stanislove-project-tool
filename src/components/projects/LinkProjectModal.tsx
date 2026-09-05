import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ChampMontant } from '../ui/ChampMontant'
import { SelecteurDevise } from '../ui/SelecteurDevise'
import { useDeviseParDefaut } from '../../lib/deviseParDefaut'
import { avecAjouts, decouperListe, montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { useAuth } from '../../contexts/useAuth'
import { useProjects } from '../../contexts/useProjects'
import { CHAMPS, PLATEFORMES } from '../../data/referentiels'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import type { ProjectType, AvisType, DdmClasse, ServiceClient, ProjetInput, Projet } from '../../types/project'
import { TYPE_LABELS, AVIS_TYPE_LABELS, DDM_CLASSE_LABELS } from '../../types/project'

interface LinkProjectModalProps {
  isOpen: boolean
  onClose: () => void
  initialNom?: string
  initialAgentId?: string
  // Clés déjà connues du côté d'où l'on crée la fiche (ligne navette, ligne
  // feuille de route) : elles étaient perdues, alors que ce sont elles qui
  // permettront ensuite de rattacher les journaux terrain à cette fiche.
  initialCodeOTP?: string
  initialChamp?: string
  onCreated?: (projet: Projet) => void
}

const selectClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'

const SERVICE_CLIENTS: ServiceClient[] = ['Construction', 'Projet', 'Métal', 'EXP', 'Autre']

export function LinkProjectModal({
  isOpen,
  onClose,
  initialNom = '',
  initialAgentId,
  initialCodeOTP = '',
  initialChamp = '',
  onCreated,
}: LinkProjectModalProps) {
  const { currentUser, users } = useAuth()
  const { projects, createProject } = useProjects()
  const isAdmin = currentUser?.role === 'admin'
  const agents = users.filter((u) => u.role === 'agent')

  // 'existante' évite de dupliquer une fiche déjà suivie ailleurs (même
  // affaire liée depuis deux endroits — Navette et Feuille de route,
  // typiquement) : recherche par nom parmi les projets déjà créés, sans
  // repasser par createProject.
  const [mode, setMode] = useState<'nouvelle' | 'existante'>('nouvelle')
  const [recherche, setRecherche] = useState('')
  const resultats = recherche.trim()
    ? projects.filter((p) => p.nom.toLowerCase().includes(recherche.trim().toLowerCase())).slice(0, 8)
    : []

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
  const [codeOTP, setCodeOTP] = useState(initialCodeOTP)
  const { valeursDe } = useListesValeurs()
  // Les menus proposent le référentiel livré **plus** ce qu'un admin a déclaré
  // dans Paramètres › Listes de valeurs — sinon une valeur ajoutée là-bas
  // n'apparaîtrait qu'une fois la fiche créée, dans sa section Références.
  const champsProposes = avecAjouts([...CHAMPS], valeursDe('commun.champs'))
  const plateformesProposees = avecAjouts([...PLATEFORMES], valeursDe('commun.plateformes'))
  const [plateformes, setPlateformes] = useState('')
  const [champ, setChamp] = useState(initialChamp)

  const resetAndClose = () => {
    setNom('')
    setAvisNumero('')
    setBudgetPrevisionnel('')
    setDateDebut('')
    setDateFin('')
    setPlateformes('')
    setContexte('')
    setRisques('')
    setMitigationRisques('')
    setOpportunites('')
    setGainsAttendus('')
    setWorkProgram(false)
    setMode('nouvelle')
    setRecherche('')
    onClose()
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!currentUser) return

    const resolvedAgentId = isAdmin ? agentId : currentUser.id

    const input: ProjetInput = {
      nom,
      type,
      avisNumero: avisNumero.trim() || undefined,
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
      codeOTP: codeOTP || undefined,
      champ: champ || undefined,
      plateformes: decouperListe(plateformes),
    }
    const projet = createProject(input)

    onCreated?.(projet)
    resetAndClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="Lier une fiche projet" maxWidth="max-w-2xl">
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode('nouvelle')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
            mode === 'nouvelle' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Nouvelle fiche
        </button>
        <button
          type="button"
          onClick={() => setMode('existante')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
            mode === 'existante' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Fiche existante
        </button>
      </div>

      {mode === 'existante' ? (
        <div className="space-y-3">
          <Input
            label="Rechercher un projet par nom"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom du projet..."
          />
          {recherche.trim() && (
            resultats.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun projet ne correspond.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {resultats.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onCreated?.(p)
                      resetAndClose()
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <span className="font-medium text-gray-900">{p.nom}</span>
                    <span className="text-xs text-gray-400 shrink-0">{TYPE_LABELS[p.type]}</span>
                  </button>
                ))}
              </div>
            )
          )}
          <div className="flex justify-end pt-2">
            <Button type="button" variant="ghost" onClick={resetAndClose}>Annuler</Button>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nom du projet" value={nom} onChange={(e) => setNom(e.target.value)} required />

        {/* Reprises de la ligne d'origine, modifiables. Le champ (site) sert à
            départager deux projets de même nom lors du rattachement
            automatique des journaux terrain (règle §2.3, lib/liaison.ts). */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Code OTP"
            value={codeOTP}
            onChange={(e) => setCodeOTP(e.target.value)}
            placeholder="GA-XXX-000000"
          />
          {/* Trois valeurs, et trois seulement (22/08/2026) : c'était une
              saisie libre, où entraient des plateformes (BDM, BDN…) — deux
              informations distinctes, désormais séparées. */}
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
            Une affaire peut débuter sur une plateforme et se poursuivre sur une autre : plusieurs valeurs sont
            possibles. Elles se complètent ensuite dans « Références du projet ».
          </p>
        </div>

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

        {/* Obligatoire quel que soit le type de projet (13/08/2026, demande
            explicite) : c'est la seule clé que portent les journaux terrain
            (CRJ, tonnage, peinture — `clesJournal*` exposent `avis`, jamais
            l'OTP). Sans elle, la fiche ne verra jamais remonter ses lignes de
            chantier, et rien ne le signalait au moment de la saisie. */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="N° d'avis / DDM (référence du projet)"
            value={avisNumero}
            onChange={(e) => setAvisNumero(e.target.value)}
            placeholder="AV-2026-000"
            required
          />
          {type === 'avis' && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">Type d'avis</label>
              <select className={selectClass} value={avisType} onChange={(e) => setAvisType(e.target.value as AvisType)}>
                {Object.entries(AVIS_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          C'est par ce numéro que le CRJ, le tonnage et la peinture se rattacheront à cette fiche : la fiche
          projet devient la référence de tout ce qui la concerne.
        </p>

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

        <div className="grid grid-cols-2 gap-4">
          <Input label="Date de début" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required />
          <Input label="Date de fin" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
        </div>

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
      )}
    </Modal>
  )
}
