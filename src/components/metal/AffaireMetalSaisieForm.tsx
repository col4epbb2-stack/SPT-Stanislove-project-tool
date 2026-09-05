import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { CalendarClock, Coins, FileCheck2, Tag, Trash2, TrendingUp } from 'lucide-react'
import {
  commentairesDeLAffaire,
  ORIGINE_COMMENTAIRE_TEXTE_LIBRE,
  type AffaireMetal,
  type AvancementMetal,
  type CommentaireMetal,
  type EtapeCommentaireMetal,
} from '../../types/travauxMetal'
import {
  avancementGeneralPrev,
  avancementGeneralReel,
  checkCfp,
  checkCft,
  checkDfa,
  dureePlanning,
  dureeProjet,
  dureeTraitementDemande,
  statutAutomatique,
  statutCorrige,
} from '../../lib/travauxMetalEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { Input } from '../ui/Input'
import { ChampMontant } from '../ui/ChampMontant'
import { UNITE_XAF } from '../../lib/unitesMontant'
import { Modal } from '../ui/Modal'
import { ChampDerive, DatalistInput, EnteteSection, SelectChamp } from '../ui/ChampsSaisie'
import { EnteteEtapes, PiedEtapes } from '../ui/FlecheEtapes'
import { useAuth } from '../../contexts/useAuth'
import { useProjects } from '../../contexts/useProjects'
import { useNavette } from '../../contexts/useNavette'
import { useFeuilleDeRoute } from '../../contexts/useFeuilleDeRoute'
import {
  bloquerEntree,
  useEtapes,
  type DefinitionEtape,
  type EtapeAffichee,
  type EtatEtape,
} from '../../lib/etapesFormulaire'
import { useMontant } from '../../lib/montantAffiche'

// Origine d'une affaire (04/09/2026, lot 2 du recueil
// doc/recueil-module-travaux-metal.md, MET-01/04/05/06) — même mécanique que
// le menu à 3 origines du formulaire CRJ (27/08/2026, rev03) : une affaire se
// rattache à une fiche projet, une ligne navette ou une ligne de feuille de
// route déjà connue, à défaut se saisit entièrement à la main. Contrairement
// au `SelecteurFicheProjet` de base (fiches seules), qu'il remplace ici.
const GROUPE_FICHE = 'Fiches projet'
const GROUPE_NAVETTE = 'Fichier navette'
const GROUPE_FDR = 'Feuille de route'
const GROUPES_SOURCE_PROJET = [GROUPE_FICHE, GROUPE_NAVETTE, GROUPE_FDR] as const

interface OptionProjetMetal {
  cle: string
  label: string
  groupe: string
  nom: string
  champ: string | null
  projetId: string | null
}

// Saisie d'une affaire METAL (06/08/2026) — la feuille "Travaux METAL" était
// jusqu'ici en lecture seule alors qu'elle est, comme le Journal
// montage/dépose du Tonnage ou le CRJ, le point d'entrée de toutes les
// données du module : les pivots du KPI METAL (avancement par champ/type
// d'avis, taux de traitement, répartitions, demandes par période) en sont
// tous dérivés.
//
// Le formulaire ne demande que les colonnes saisies de la feuille. Les
// colonnes calculées — statut corrigé, durées (traitement, projet, planning),
// checks CFP/CFT, avancement général prévisionnel et réel — sont dérivées par
// lib/travauxMetalEngine.ts et affichées en lecture seule au fil de la
// saisie, dans l'étape où elles prennent leur sens. C'est d'autant plus
// important ici que ces colonnes sont cassées en #REF! dans le classeur
// source : l'app est le seul endroit où elles ont une valeur.
//
// Une affaire a un cycle de vie long (demande → planning → phases → doc
// finale → clôture) : comme le Journal tonnage, ce formulaire sert autant à
// créer une affaire qu'à compléter une affaire existante (crayon dans le
// tableau), l'enregistrement écrasant la même ligne.

export type AffaireMetalSaisieInput = Omit<AffaireMetal, 'id'>

function champVide(): AffaireMetalSaisieInput {
  return {
    affaire: null,
    typeCoreCrew: null,
    typeAvis: null,
    priorite: null,
    po: null,
    ot: null,
    avis: null,
    champ: null,
    plateforme: null,
    risques: null,
    typeTravaux: null,
    statutTravaux: null,
    dateDemande: null,
    dateDebutPlanning: null,
    dateFinPlanningPrev: null,
    dateDebutReel: null,
    dateFinReel: null,
    avancementEtude: null,
    dureeMto: null,
    tempsMisMto: null,
    avancementPrevMto: null,
    avancementFourniture: null,
    avancementPrefab: null,
    pctReparation: null,
    avancementTravauxSite: null,
    cfpApplicable: null,
    cfpDate: null,
    cftApplicable: null,
    cftDate: null,
    dfa: null,
    dfaDate: null,
    coutReel: null,
    commentaire: null,
    statut: null,
  }
}

export interface AffaireMetalSuggestions {
  champs: string[]
  plateformes: string[]
  typesTravaux: string[]
  typesAvis: string[]
  statutsTravaux: string[]
  risques: string[]
  typesCoreCrew: string[]
  priorites: string[]
}

const OUI_NON = ['OUI', 'NON']

// Les 8 colonnes d'avancement de phase de la feuille, dans l'ordre. Les 4
// premières (étude, fourniture, préfabrication, travaux sur site) sont celles
// qui composent l'avancement général réel (moyenne) — les autres décrivent le
// MTO et la réparation.
const PHASES: { cle: keyof AffaireMetalSaisieInput; label: string; compteDansGeneral: boolean }[] = [
  { cle: 'avancementEtude', label: 'Étude', compteDansGeneral: true },
  { cle: 'dureeMto', label: 'Durée MTO', compteDansGeneral: false },
  { cle: 'tempsMisMto', label: 'Temps mis MTO', compteDansGeneral: false },
  { cle: 'avancementPrevMto', label: 'Prév. MTO', compteDansGeneral: false },
  { cle: 'avancementFourniture', label: 'Fourniture', compteDansGeneral: true },
  { cle: 'avancementPrefab', label: 'Préfabrication', compteDansGeneral: true },
  { cle: 'pctReparation', label: '% réparation', compteDansGeneral: false },
  { cle: 'avancementTravauxSite', label: 'Travaux sur site', compteDansGeneral: true },
]

// Durée MTO / Temps mis MTO / Prév. MTO restent sur le modèle (colonnes du
// classeur) mais ne sont plus saisies depuis ce formulaire (04/09/2026, lot 1
// du recueil doc/recueil-module-travaux-metal.md, MET-15→18) : aucun calcul
// du moteur ne les lit aujourd'hui, et le document les range en "back end".
const PHASES_SAISIES = PHASES.filter(
  ({ cle }) => cle !== 'dureeMto' && cle !== 'tempsMisMto' && cle !== 'avancementPrevMto'
)

type EtapeAffaire = 'identification' | 'planning' | 'avancement' | 'documentation' | 'cloture'

const ETAPES: DefinitionEtape<EtapeAffaire>[] = [
  { key: 'identification', label: 'Identification', icon: Tag, optionnel: false },
  { key: 'planning', label: 'Planning', icon: CalendarClock, optionnel: false },
  { key: 'avancement', label: 'Avancement', icon: TrendingUp, optionnel: false },
  { key: 'documentation', label: 'Doc. finale', icon: FileCheck2, optionnel: true },
  { key: 'cloture', label: 'Coût & statut', icon: Coins, optionnel: true },
]

// Un avancement de phase vaut un pourcentage, "NA" (non applicable dans le
// classeur) ou vide — d'où le bouton NA à côté du champ plutôt qu'un simple
// champ nombre qui ne saurait pas exprimer les 3 cas.
function SaisieAvancement({
  label,
  valeur,
  onChange,
}: {
  label: string
  valeur: AvancementMetal
  onChange: (v: AvancementMetal) => void
}) {
  const estNa = typeof valeur === 'string'
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-500">{label}</label>
      <div className="flex gap-1.5">
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          disabled={estNa}
          value={typeof valeur === 'number' ? String(Math.round(valeur * 100)) : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value) / 100)}
          placeholder="%"
          className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => onChange(estNa ? null : 'NA')}
          className={`px-2.5 rounded-xl border text-xs font-semibold shrink-0 transition-colors ${
            estNa ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
          title="Phase non applicable à cette affaire"
        >
          NA
        </button>
      </div>
    </div>
  )
}

// Une zone de commentaire par étape (04/09/2026, lot 4 du recueil, MET-25) —
// remplace l'ancien champ `commentaire` unique, saisi uniquement depuis
// l'étape "Coût & statut". Chaque instance ne montre que les entrées de
// l'étape courante ; `commentaires` porte la liste entière de l'affaire (les
// autres étapes en gardent les leurs).
function CommentairesEtape({
  etape,
  commentaires,
  onChange,
}: {
  etape: EtapeCommentaireMetal
  commentaires: CommentaireMetal[]
  onChange: (commentaires: CommentaireMetal[]) => void
}) {
  const [texte, setTexte] = useState('')
  const deCetteEtape = commentaires.filter((c) => c.etape === etape)

  const ajouter = () => {
    const contenu = texte.trim()
    if (!contenu) return
    onChange([...commentaires, { id: crypto.randomUUID(), etape, texte: contenu }])
    setTexte('')
  }

  const supprimer = (id: string) => onChange(commentaires.filter((c) => c.id !== id))

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
      <p className="text-xs font-medium text-gray-500">
        Commentaires de cette étape{deCetteEtape.length > 0 ? ` (${deCetteEtape.length})` : ''}
      </p>
      {deCetteEtape.map((c) => (
        <div
          key={c.id}
          className="flex items-start justify-between gap-2 text-sm bg-white rounded-lg border border-gray-100 px-3 py-2"
        >
          <div>
            <p className="text-gray-700 whitespace-pre-wrap">{c.texte}</p>
            {c.id === ORIGINE_COMMENTAIRE_TEXTE_LIBRE && (
              <p className="text-xs text-amber-600 mt-1">
                Repris de l'ancien commentaire unique de l'affaire — à confirmer ou déplacer si besoin.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => supprimer(c.id)}
            className="text-gray-400 hover:text-red-600 shrink-0"
            title="Supprimer ce commentaire"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ajouter()
            }
          }}
          placeholder="Ajouter un commentaire…"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          type="button"
          onClick={ajouter}
          disabled={!texte.trim()}
          className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 shrink-0"
        >
          Ajouter
        </button>
      </div>
    </div>
  )
}

export function AffaireMetalSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  suggestions,
  affaireInitiale,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: AffaireMetalSaisieInput) => Promise<void>
  suggestions: AffaireMetalSuggestions
  affaireInitiale?: AffaireMetal | null
}) {
  const { montant: formatMontant } = useMontant()
  const { currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const { projects } = useProjects()
  const { lignes: lignesNavette } = useNavette()
  const { projets: projetsFdr } = useFeuilleDeRoute()
  const [valeurs, setValeurs] = useState<AffaireMetalSaisieInput>(champVide)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { etapeActive, etapesVues, allerEtape, reinitialiserEtapes } = useEtapes<EtapeAffaire>('identification')

  // Menu à 3 origines (fiches projet / navette / feuille de route), comme le
  // formulaire CRJ. Les fiches sont limitées au périmètre de l'utilisateur
  // non-admin, même règle que le CRJ. Une ligne navette/FdR déjà liée à une
  // fiche visible n'est pas listée une seconde fois.
  const optionsProjet = useMemo(() => {
    const fiches = currentUser ? (isAdmin ? projects : projects.filter((p) => p.agentId === currentUser.id)) : []
    const idsFiches = new Set(fiches.map((f) => f.id))
    const options: OptionProjetMetal[] = fiches
      .map((f) => ({
        cle: `fiche:${f.id}`,
        label: f.nom,
        groupe: GROUPE_FICHE,
        nom: f.nom,
        champ: f.champ ?? null,
        projetId: f.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
    for (const l of lignesNavette) {
      if (l.projetId && idsFiches.has(l.projetId)) continue
      options.push({
        cle: `navette:${l.id}`,
        label: l.codeOTP ? `${l.libelle} (${l.codeOTP})` : l.libelle,
        groupe: GROUPE_NAVETTE,
        nom: l.libelle,
        champ: null,
        projetId: l.projetId && idsFiches.has(l.projetId) ? l.projetId : null,
      })
    }
    for (const p of projetsFdr) {
      if (p.projetId && idsFiches.has(p.projetId)) continue
      options.push({
        cle: `fdr:${p.id}`,
        label: p.otp ? `${p.projet} (${p.otp})` : p.projet,
        groupe: GROUPE_FDR,
        nom: p.projet,
        champ: null,
        projetId: p.projetId && idsFiches.has(p.projetId) ? p.projetId : null,
      })
    }
    return options
  }, [projects, isAdmin, currentUser, lignesNavette, projetsFdr])

  // Deux modes visuellement distincts (04/09/2026, MET-06 : « distinguer
  // clairement les deux actions […] éviter la création involontaire de
  // doublons ») plutôt qu'un menu facultatif suivi d'un champ texte toujours
  // modifiable, comme c'était le cas jusqu'ici.
  const [modeIdentification, setModeIdentification] = useState<'existant' | 'nouveau'>('nouveau')
  const [choixProjet, setChoixProjet] = useState('')

  const selectionnerProjet = (cle: string) => {
    setChoixProjet(cle)
    const option = optionsProjet.find((o) => o.cle === cle)
    if (!option) {
      setValeurs((prev) => ({ ...prev, projetId: null }))
      return
    }
    setValeurs((prev) => {
      // Une ligne navette/FdR sans fiche ne porte qu'un libellé : on le
      // reprend, et rien d'autre n'est inventé (même règle que le CRJ).
      let champ = option.champ ?? prev.champ
      let avis = prev.avis
      if (option.projetId) {
        const projet = projects.find((p) => p.id === option.projetId)
        if (projet) {
          champ = projet.champ ?? champ
          const reference = [projet.avisNumero, ...projet.avisNumeros].find((a) => !!a && !!String(a).trim())
          avis = reference ? String(reference) : avis
        }
      }
      return { ...prev, projetId: option.projetId, affaire: option.nom, champ, avis }
    })
  }

  // Pré-remplissage à l'ouverture ajusté pendant le rendu plutôt que dans un
  // useEffect (même pattern que les autres formulaires du projet).
  const [cleAppliquee, setCleAppliquee] = useState<string | null>(null)
  const cleCourante = isOpen ? String(affaireInitiale?.id ?? 'nouveau') : null
  if (cleCourante !== null && cleCourante !== cleAppliquee) {
    setCleAppliquee(cleCourante)
    setErreur(null)
    reinitialiserEtapes()
    if (affaireInitiale) {
      const { id, ...reste } = affaireInitiale
      void id
      setValeurs(reste)
      setModeIdentification(affaireInitiale.projetId ? 'existant' : 'nouveau')
      setChoixProjet(affaireInitiale.projetId ? `fiche:${affaireInitiale.projetId}` : '')
    } else {
      setValeurs(champVide())
      setModeIdentification('nouveau')
      setChoixProjet('')
    }
  } else if (cleCourante === null && cleAppliquee !== null) {
    setCleAppliquee(null)
  }

  const texteValeur = (cle: keyof AffaireMetalSaisieInput) => (valeurs[cle] as string | null) ?? ''
  const setTexte = (cle: keyof AffaireMetalSaisieInput, v: string) =>
    setValeurs((prev) => ({ ...prev, [cle]: v || null }))
  const texte = (cle: keyof AffaireMetalSaisieInput) => ({
    value: texteValeur(cle),
    onChange: (e: ChangeEvent<HTMLInputElement>) => setTexte(cle, e.target.value),
  })

  // Colonnes calculées, recalculées en direct sur la saisie en cours.
  const apercu: AffaireMetal = { id: affaireInitiale?.id ?? 'nouveau', ...valeurs }
  const avctPrev = avancementGeneralPrev(apercu)
  const avctReel = avancementGeneralReel(apercu)

  // Commentaires par étape (04/09/2026, lot 4, MET-25→31) : `commentaires`
  // fait foi dès qu'il existe, sinon l'ancien champ `commentaire` unique est
  // repris en une entrée (commentairesDeLAffaire) — écrire ici la convertit
  // naturellement au premier ajout, sans migration ni perte.
  const commentaires = commentairesDeLAffaire(valeurs)
  const definirCommentaires = (nouveaux: CommentaireMetal[]) =>
    setValeurs((prev) => ({ ...prev, commentaires: nouveaux }))

  const phasesRenseignees = PHASES_SAISIES.filter(({ cle }) => valeurs[cle] != null).length
  const datesPlanning = [valeurs.dateDebutPlanning, valeurs.dateFinPlanningPrev].filter(Boolean).length

  const etatEtape = (cle: EtapeAffaire): { etat: EtatEtape; resume: string } => {
    const vue = etapesVues.includes(cle)
    switch (cle) {
      case 'identification':
        if (valeurs.affaire && valeurs.champ) {
          return { etat: 'complet', resume: `${valeurs.champ} · ${valeurs.avis ?? 'avis ?'}` }
        }
        return valeurs.affaire || valeurs.avis || valeurs.ot
          ? { etat: 'partiel', resume: valeurs.affaire ? 'Champ manquant' : "Libellé d'affaire manquant" }
          : { etat: 'vide', resume: 'Affaire à identifier' }
      case 'planning':
        if (valeurs.dateDemande && datesPlanning === 2) {
          return { etat: 'complet', resume: `Avct prév. ${formatPercent(avctPrev)}` }
        }
        return valeurs.dateDemande || datesPlanning > 0
          ? { etat: 'partiel', resume: 'Planning incomplet' }
          : { etat: 'vide', resume: 'Demande et planning' }
      case 'avancement':
        if (avctReel != null) {
          return {
            etat: 'complet',
            resume: `${phasesRenseignees}/${PHASES_SAISIES.length} phases · réel ${formatPercent(avctReel)}`,
          }
        }
        return phasesRenseignees > 0
          ? { etat: 'partiel', resume: 'Aucune phase chiffrée' }
          : { etat: 'vide', resume: 'Étude → travaux' }
      case 'documentation': {
        const remplies = [valeurs.cfpApplicable, valeurs.cftApplicable, valeurs.dfa].filter(Boolean).length
        if (remplies > 0) {
          return { etat: 'complet', resume: `CFP ${checkCfp(apercu)} · CFT ${checkCft(apercu)} · DFA ${checkDfa(apercu)}` }
        }
        return vue ? { etat: 'vu', resume: 'Rien à signaler' } : { etat: 'vide', resume: 'CFP / CFT / DFA' }
      }
      case 'cloture': {
        // Le statut n'est plus une saisie (04/09/2026, lot 3, MET-42→45) :
        // l'étape reste "complète" dès que le coût est renseigné, "vue" sinon
        // — le statut, lui, s'affiche toujours (statutAutomatique ci-dessous).
        const statut = statutAutomatique(apercu)
        if (valeurs.coutReel != null) {
          return { etat: 'complet', resume: `${statut} · ${formatMontant(valeurs.coutReel, 'XAF')}` }
        }
        return vue ? { etat: 'vu', resume: `Statut : ${statut}` } : { etat: 'vide', resume: 'À vérifier' }
      }
    }
  }

  const etapes: EtapeAffichee<EtapeAffaire>[] = ETAPES.map((e) => ({ ...e, ...etatEtape(e.key) }))
  const manquantes = etapes.filter((e) => !e.optionnel && e.etat !== 'complet')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Les champs `required` des étapes non affichées ne sont pas dans le DOM :
    // la validation native ne les voit plus, c'est donc ici qu'on vérifie les
    // étapes obligatoires — et on ramène sur la première qui manque.
    if (manquantes.length > 0) {
      setErreur(`À compléter avant d'enregistrer : ${manquantes.map((m) => m.label).join(', ')}.`)
      allerEtape(manquantes[0].key)
      return
    }
    setEnregistrement(true)
    setErreur(null)
    try {
      // Le statut n'est plus saisi : il est recalculé au moment d'enregistrer
      // (statutAutomatique), pour que le document Firestore reste lisible
      // hors de l'application sans en dépendre pour l'afficher.
      await onSubmit({ ...valeurs, statut: statutAutomatique(apercu) })
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={affaireInitiale ? `Modifier l'affaire ${affaireInitiale.avis ?? ''}` : 'Nouvelle affaire METAL'}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} onKeyDown={bloquerEntree(etapes, etapeActive)} className="space-y-5">
        <EnteteEtapes etapes={etapes} active={etapeActive} onSelect={allerEtape} manquantes={manquantes} />

        {etapeActive === 'identification' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Identification de l'affaire"
              aide="Le champ (AGM / IM / TRM) et le type d'avis pilotent les pivots du KPI METAL."
            />
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-700">Origine de l'affaire</label>
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setModeIdentification('existant')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    modeIdentification === 'existant'
                      ? 'bg-white shadow-sm text-primary'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Projet existant
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModeIdentification('nouveau')
                    setChoixProjet('')
                    setValeurs((prev) => ({ ...prev, projetId: null }))
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    modeIdentification === 'nouveau'
                      ? 'bg-white shadow-sm text-primary'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Nouvelle affaire
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {modeIdentification === 'existant'
                  ? 'Rattache cette affaire à un projet déjà connu — fiche projet, ligne navette ou ligne de feuille de route.'
                  : "Cette affaire n'existe encore nulle part : elle se saisit entièrement ci-dessous."}
              </p>
            </div>
            {modeIdentification === 'existant' && (
              <div>
                <select
                  value={choixProjet}
                  onChange={(e) => selectionnerProjet(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition"
                >
                  <option value="">— Sélectionner un projet —</option>
                  {GROUPES_SOURCE_PROJET.map((groupe) => {
                    const options = optionsProjet.filter((o) => o.groupe === groupe)
                    if (options.length === 0) return null
                    return (
                      <optgroup key={groupe} label={groupe}>
                        {options.map((o) => (
                          <option key={o.cle} value={o.cle}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
                {choixProjet && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Champs pré-remplis depuis ce choix — modifiables ci-dessous si besoin.
                    {!valeurs.projetId &&
                      " Cette ligne n'a pas encore de fiche projet : le rattachement se fera par son nom et son n° d'avis."}
                  </p>
                )}
              </div>
            )}
            <Input label="Affaire" {...texte('affaire')} required />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="N° d'avis" {...texte('avis')} />
              <Input label="OT" {...texte('ot')} />
              <Input label="PO" {...texte('po')} />
              <DatalistInput
                id="dl-metal-champ"
                label="Champ"
                value={texteValeur('champ')}
                onChange={(v) => setTexte('champ', v)}
                options={suggestions.champs}
                administree
              />
              <DatalistInput
                id="dl-metal-plateforme"
                label="Plateforme"
                value={texteValeur('plateforme')}
                onChange={(v) => setTexte('plateforme', v)}
                options={suggestions.plateformes}
                administree
              />
              <DatalistInput
                id="dl-metal-type-avis"
                label="Type d'avis"
                value={texteValeur('typeAvis')}
                onChange={(v) => setTexte('typeAvis', v)}
                options={suggestions.typesAvis}
                administree
              />
              <DatalistInput
                id="dl-metal-core-crew"
                label="Type de Core crew"
                value={texteValeur('typeCoreCrew')}
                onChange={(v) => setTexte('typeCoreCrew', v)}
                options={suggestions.typesCoreCrew}
                administree
              />
              <DatalistInput
                id="dl-metal-priorite"
                label="Priorité"
                value={texteValeur('priorite')}
                onChange={(v) => setTexte('priorite', v)}
                options={suggestions.priorites}
                administree
              />
              <DatalistInput
                id="dl-metal-risques"
                label="Risques"
                value={texteValeur('risques')}
                onChange={(v) => setTexte('risques', v)}
                options={suggestions.risques}
                administree
              />
              <DatalistInput
                id="dl-metal-type-travaux"
                label="Type de travaux"
                value={texteValeur('typeTravaux')}
                onChange={(v) => setTexte('typeTravaux', v)}
                options={suggestions.typesTravaux}
                administree
              />
              <DatalistInput
                id="dl-metal-statut-travaux"
                label="Statut travaux"
                value={texteValeur('statutTravaux')}
                onChange={(v) => setTexte('statutTravaux', v)}
                options={suggestions.statutsTravaux}
                administree
              />
              <ChampDerive
                label="Statut corrigé"
                valeur={statutCorrige(apercu) || null}
                aide="« Terminée » si le statut travaux commence par Soldée ou Ter"
              />
            </div>
            <CommentairesEtape etape="identification" commentaires={commentaires} onChange={definirCommentaires} />
          </div>
        )}

        {etapeActive === 'planning' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Planning de l'affaire"
              aide="Les écarts de la feuille en découlent : traitement de la demande, durée du projet, durée planning, et l'avancement général prévisionnel (temps écoulé sur la fenêtre planifiée)."
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Input label="Date de la demande" type="date" {...texte('dateDemande')} />
              <Input label="Début planning" type="date" {...texte('dateDebutPlanning')} />
              <Input label="Fin prévisionnelle" type="date" {...texte('dateFinPlanningPrev')} />
              <Input label="Début réel" type="date" {...texte('dateDebutReel')} />
              <Input label="Fin réelle" type="date" {...texte('dateFinReel')} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ChampDerive
                label="Traitement demande (j)"
                valeur={formatNombre(dureeTraitementDemande(apercu))}
                aide="Début planning − demande"
              />
              <ChampDerive
                label="Durée projet (j)"
                valeur={formatNombre(dureeProjet(apercu))}
                aide="Fin réelle − début réel"
              />
              <ChampDerive
                label="Durée planning (j)"
                valeur={formatNombre(dureePlanning(apercu))}
                aide="Fin prév. − début planning"
              />
              <ChampDerive
                label="Avct général prév."
                valeur={avctPrev != null ? formatPercent(avctPrev) : 'NA'}
                aide="Temps écoulé sur la fenêtre planifiée"
              />
            </div>
            <CommentairesEtape etape="planning" commentaires={commentaires} onChange={definirCommentaires} />
          </div>
        )}

        {etapeActive === 'avancement' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Avancement des phases"
              aide="Étude, fourniture, préfabrication et travaux sur site composent l'avancement général réel (moyenne des phases chiffrées). NA = phase non applicable, elle sort de la moyenne."
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {PHASES_SAISIES.map(({ cle, label, compteDansGeneral }) => (
                <SaisieAvancement
                  key={cle}
                  label={compteDansGeneral ? `${label} *` : label}
                  valeur={valeurs[cle] as AvancementMetal}
                  onChange={(v) => setValeurs((prev) => ({ ...prev, [cle]: v }))}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ChampDerive
                label="Avct général réel"
                valeur={avctReel != null ? formatPercent(avctReel) : null}
                aide="* moyenne des 4 phases marquées, chiffrées uniquement"
              />
              <ChampDerive
                label="Écart réel vs prévisionnel"
                valeur={avctReel != null && avctPrev != null ? formatPercent(avctReel - avctPrev) : null}
              />
            </div>
            <CommentairesEtape etape="avancement" commentaires={commentaires} onChange={definirCommentaires} />
          </div>
        )}

        {etapeActive === 'documentation' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Documentation finale"
              aide="Une affaire n'est soldée que DFA, CFP et CFT signés — c'est ce qui distingue « terminée » de « soldée » dans le taux de traitement."
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <SelectChamp
                label="CFP applicable"
                value={texteValeur('cfpApplicable')}
                onChange={(v) => setTexte('cfpApplicable', v)}
                options={OUI_NON}
              />
              <Input label="Date CFP" type="date" {...texte('cfpDate')} />
              <SelectChamp
                label="CFT applicable"
                value={texteValeur('cftApplicable')}
                onChange={(v) => setTexte('cftApplicable', v)}
                options={OUI_NON}
              />
              <Input label="Date CFT" type="date" {...texte('cftDate')} />
            </div>
            {/* Check CFP / Check CFT restent calculés (checkCfp/checkCft,
                utilisés dans le résumé de l'étape ci-dessus et la colonne du
                tableau) mais ne sont plus affichés ici — 04/09/2026, lot 1 du
                recueil, MET-19/20. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <SelectChamp
                label="DFA"
                value={texteValeur('dfa')}
                onChange={(v) => setTexte('dfa', v)}
                options={OUI_NON}
              />
              <Input label="Date DFA" type="date" {...texte('dfaDate')} />
              {/* Check DFA reste affiché, contrairement à Check CFP/CFT :
                  MET-23 (lot 3) demande explicitement de dire si le DFA a été
                  validé, à l'inverse d'un champ back end à masquer. */}
              <ChampDerive
                label="Check DFA"
                valeur={checkDfa(apercu)}
                aide="OK si DFA=OUI avec sa date, ou DFA=NON — sinon IN PROGRESS"
              />
            </div>
            <CommentairesEtape etape="documentation" commentaires={commentaires} onChange={definirCommentaires} />
          </div>
        )}

        {etapeActive === 'cloture' && (
          <div className="space-y-4">
            <EnteteSection titre="Coût et statut" aide="Facultatif tant que l'affaire n'est pas clôturée." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Colonne « Coût réel (XAF) » du classeur METAL : l'unité
                  d'enregistrement reste le franc CFA, la saisie accepte une
                  autre devise (18/08/2026, référentiel des devises). */}
              <ChampMontant
                label="Coût réel"
                devise={UNITE_XAF.devise}
                pas="1"
                value={valeurs.coutReel}
                onChange={(v) => setValeurs((prev) => ({ ...prev, coutReel: v }))}
              />
              {/* Plus saisi manuellement (04/09/2026, lot 3, MET-42→45) :
                  CLOSED à 100 % d'avancement général réel, IN PROGRESS sinon
                  — y compris tant qu'aucune phase n'est chiffrée. */}
              <ChampDerive
                label="Statut"
                valeur={statutAutomatique(apercu)}
                aide="IN PROGRESS tant que l'avancement général réel n'atteint pas 100 %, CLOSED à 100 %"
              />
            </div>
            {/* L'ancien champ "Commentaire" unique (`valeurs.commentaire`)
                n'est plus saisi ici (04/09/2026, lot 4, MET-25) — remplacé
                par les 5 zones par étape ci-dessous. La valeur déjà en base
                n'est jamais effacée : elle reste lisible via
                commentairesDeLAffaire(), reprise ici sous "Coût & statut",
                la seule étape où elle était saisissable. */}
            <CommentairesEtape etape="cloture" commentaires={commentaires} onChange={definirCommentaires} />
          </div>
        )}

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}

        <PiedEtapes
          etapes={etapes}
          active={etapeActive}
          onAller={allerEtape}
          onAnnuler={onClose}
          enregistrement={enregistrement}
          complet={manquantes.length === 0}
          libelleSubmit={affaireInitiale ? 'Enregistrer les modifications' : "Enregistrer l'affaire"}
        />
      </form>
    </Modal>
  )
}
