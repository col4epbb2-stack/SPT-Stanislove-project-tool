import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { CalendarClock, Coins, LineChart, Tag } from 'lucide-react'
import type { ActiviteCourbe, NumeroCourbeType, VueCourbe } from '../../types/courbeEnS'
import { VUE_COURBE_LABELS } from '../../types/courbeEnS'
import { COURBES_TYPES } from '../../data/courbeEnS/courbesTypes'
import { avancementPlanifie, calculsActivite, dureeJours } from '../../lib/courbeEnSEngine'
import { formatDate, formatNombre, formatPercent } from '../../lib/format'
import { Input } from '../ui/Input'
import { ChampMontant } from '../ui/ChampMontant'
import { Modal } from '../ui/Modal'
import { ChampDerive, DatalistInput, EnteteSection, SelectChamp } from '../ui/ChampsSaisie'
import { EnteteEtapes, PiedEtapes } from '../ui/FlecheEtapes'
import { miniInputClass } from '../ui/classes'
import {
  bloquerEntree,
  useEtapes,
  type DefinitionEtape,
  type EtapeAffichee,
  type EtatEtape,
} from '../../lib/etapesFormulaire'

// Saisie d'une activité de courbe en S. Une ligne de l'une des 3 feuilles du
// classeur — mêmes colonnes, dans l'ordre où elles s'y enchaînent.
//
// Le formulaire ne demande que les colonnes saisies : durée, pondération et
// pondération par phase sont calculées et affichées en lecture seule au fil
// de la saisie, comme partout ailleurs dans l'app. L'avancement hebdomadaire
// des vues Baseline et Forecast ne se saisit pas du tout — c'est précisément
// ce que le gabarit produit ; seule la vue Réalisé porte des relevés, et son
// étape dédiée n'apparaît que là.

export type ActiviteSaisieInput = Omit<ActiviteCourbe, 'id'>

function champVide(vue: VueCourbe, ordre: number, projet: string, projetId: string): ActiviteSaisieInput {
  return {
    vue,
    ordre,
    projet,
    projetId,
    typeAvis: null,
    classification: null,
    phase: null,
    activite: null,
    champ: null,
    plateforme: null,
    service: null,
    debut: null,
    fin: null,
    courbeType: null,
    tests: null,
    budget: null,
    ...(vue === 'realise' ? { realiseHebdo: {} } : {}),
  }
}

export interface SuggestionsActivite {
  projets: string[]
  phases: string[]
  taches: string[]
  champs: string[]
  plateformes: string[]
  services: string[]
  typesAvis: string[]
  classifications: string[]
}

type EtapeActivite = 'projet' | 'planning' | 'classement' | 'releves'

const ETAPES_BASE: DefinitionEtape<EtapeActivite>[] = [
  { key: 'projet', label: 'Projet & activité', icon: Tag, optionnel: false },
  { key: 'planning', label: 'Dates & gabarit', icon: CalendarClock, optionnel: false },
  { key: 'classement', label: 'Classement & budget', icon: Coins, optionnel: true },
]

const ETAPE_RELEVES: DefinitionEtape<EtapeActivite> = {
  key: 'releves',
  label: 'Relevés hebdo',
  icon: LineChart,
  optionnel: true,
}

export function ActiviteSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  vue,
  suggestions,
  semaines,
  activiteInitiale,
  prochainOrdre,
  toutes,
  projetParDefaut,
  projetId,
  devise,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: ActiviteSaisieInput) => Promise<void>
  vue: VueCourbe
  suggestions: SuggestionsActivite
  /** Axe hebdomadaire de la feuille — colonnes de saisie de la vue Réalisé. */
  semaines: string[]
  activiteInitiale?: ActiviteCourbe | null
  prochainOrdre: number
  toutes: ActiviteCourbe[]
  /** Nom de projet du classeur auquel la nouvelle activité se rattache. */
  projetParDefaut: string
  /** Devise de la fiche projet, appliquée au budget de l'activité. */
  devise: string
  /** Fiche projet ouverte : le lien explicite est posé dès la création, une
   * activité saisie depuis une fiche lui appartient sans ambiguïté. */
  projetId: string
}) {
  const [valeurs, setValeurs] = useState<ActiviteSaisieInput>(() => champVide(vue, prochainOrdre, projetParDefaut, projetId))
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { etapeActive, etapesVues, allerEtape, reinitialiserEtapes } = useEtapes<EtapeActivite>('projet')

  const etapesDefinies = vue === 'realise' ? [...ETAPES_BASE, ETAPE_RELEVES] : ETAPES_BASE

  // Pré-remplissage à l'ouverture pendant le rendu (même pattern que les
  // autres formulaires du projet, pas de useEffect de synchronisation).
  const [cleAppliquee, setCleAppliquee] = useState<string | null>(null)
  const cleCourante = isOpen ? `${vue}:${activiteInitiale?.id ?? 'nouveau'}` : null
  if (cleCourante !== null && cleCourante !== cleAppliquee) {
    setCleAppliquee(cleCourante)
    setErreur(null)
    reinitialiserEtapes()
    if (activiteInitiale) {
      const { id, ...reste } = activiteInitiale
      void id
      setValeurs(reste)
    } else {
      setValeurs(champVide(vue, prochainOrdre, projetParDefaut, projetId))
    }
  } else if (cleCourante === null && cleAppliquee !== null) {
    setCleAppliquee(null)
  }

  const texteValeur = (cle: keyof ActiviteSaisieInput) => (valeurs[cle] as string | null) ?? ''
  const setTexte = (cle: keyof ActiviteSaisieInput, v: string) =>
    setValeurs((prev) => ({ ...prev, [cle]: v || null }))
  const texte = (cle: keyof ActiviteSaisieInput) => ({
    value: texteValeur(cle),
    onChange: (e: ChangeEvent<HTMLInputElement>) => setTexte(cle, e.target.value),
  })

  const apercu: ActiviteCourbe = { id: activiteInitiale?.id ?? 'nouveau', ...valeurs }
  // Les pondérations se lisent sur la feuille complète, la ligne en cours
  // remplaçant celle qu'on modifie (sinon elle serait comptée deux fois).
  const feuille = [...toutes.filter((a) => a.id !== apercu.id), apercu]
  const calculs = calculsActivite(apercu, feuille)
  const duree = dureeJours(valeurs.debut, valeurs.fin)
  const datesInversees = Boolean(valeurs.debut && valeurs.fin && duree === null)

  const relevesSaisis = Object.keys(valeurs.realiseHebdo ?? {}).length

  const etatEtape = (cle: EtapeActivite): { etat: EtatEtape; resume: string } => {
    const vueEtape = etapesVues.includes(cle)
    switch (cle) {
      case 'projet':
        if (valeurs.projet && valeurs.activite) {
          return { etat: 'complet', resume: `${valeurs.activite}` }
        }
        return valeurs.projet || valeurs.activite || valeurs.phase
          ? { etat: 'partiel', resume: valeurs.projet ? "Nom d'activité manquant" : 'Projet manquant' }
          : { etat: 'vide', resume: 'Projet et sous-phase' }
      case 'planning':
        if (valeurs.debut && valeurs.fin && valeurs.courbeType && !datesInversees) {
          return { etat: 'complet', resume: `${formatNombre(duree)} j · type ${valeurs.courbeType}` }
        }
        if (datesInversees) return { etat: 'partiel', resume: 'Fin avant le début' }
        return valeurs.debut || valeurs.fin || valeurs.courbeType
          ? { etat: 'partiel', resume: valeurs.courbeType ? 'Dates incomplètes' : 'Gabarit à choisir' }
          : { etat: 'vide', resume: 'Start, End, gabarit' }
      case 'classement': {
        const remplis = [valeurs.champ, valeurs.plateforme, valeurs.service, valeurs.typeAvis].filter(Boolean).length
        if (remplis > 0) return { etat: 'complet', resume: `${remplis} champ(s) renseigné(s)` }
        return vueEtape ? { etat: 'vu', resume: 'Non classée' } : { etat: 'vide', resume: 'Champ, service, budget' }
      }
      case 'releves':
        if (relevesSaisis > 0) return { etat: 'complet', resume: `${relevesSaisis} semaine(s) pointée(s)` }
        return vueEtape ? { etat: 'vu', resume: 'Pas encore démarrée' } : { etat: 'vide', resume: 'Avancement constaté' }
    }
  }

  const etapes: EtapeAffichee<EtapeActivite>[] = etapesDefinies.map((e) => ({ ...e, ...etatEtape(e.key) }))
  const manquantes = etapes.filter((e) => !e.optionnel && e.etat !== 'complet')

  const setReleve = (semaine: string, valeur: string) =>
    setValeurs((prev) => {
      const releves = { ...(prev.realiseHebdo ?? {}) }
      // Vider une case retire la semaine du relevé : « non pointé » et « 0 % »
      // ne disent pas la même chose (l'un interrompt la courbe, l'autre la
      // pose à zéro).
      if (valeur === '') delete releves[semaine]
      else releves[semaine] = Number(valeur) / 100
      return { ...prev, realiseHebdo: releves }
    })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (manquantes.length > 0) {
      setErreur(`À compléter avant d'enregistrer : ${manquantes.map((m) => m.label).join(', ')}.`)
      allerEtape(manquantes[0].key)
      return
    }
    setEnregistrement(true)
    setErreur(null)
    try {
      await onSubmit(valeurs)
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
      title={
        activiteInitiale
          ? `Modifier l'activité n° ${activiteInitiale.ordre} — ${VUE_COURBE_LABELS[vue]}`
          : `Nouvelle activité — ${VUE_COURBE_LABELS[vue]}`
      }
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} onKeyDown={bloquerEntree(etapes, etapeActive)} className="space-y-5">
        <EnteteEtapes etapes={etapes} active={etapeActive} onSelect={allerEtape} manquantes={manquantes} />

        {etapeActive === 'projet' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Projet et activité"
              aide="Le nom du projet regroupe les activités d'une même courbe : c'est sur lui que se calcule la pondération par phase."
            />
            <DatalistInput
              id="dl-scurve-projet"
              label="Projet"
              value={valeurs.projet}
              onChange={(v) => setValeurs((prev) => ({ ...prev, projet: v }))}
              options={suggestions.projets}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DatalistInput
                id="dl-scurve-phase"
                label="Phase"
                value={texteValeur('phase')}
                onChange={(v) => setTexte('phase', v)}
                options={suggestions.phases}
              />
              <DatalistInput
                id="dl-scurve-activite"
                label="Activity Name / Sous-phase"
                value={texteValeur('activite')}
                onChange={(v) => setTexte('activite', v)}
                options={suggestions.taches}
              />
              <Input
                label="N° Ordre"
                type="number"
                min="1"
                value={String(valeurs.ordre)}
                onChange={(e) =>
                  setValeurs((prev) => ({ ...prev, ordre: Number(e.target.value) || prochainOrdre }))
                }
              />
              <ChampDerive
                label="Pondération par phase"
                valeur={formatPercent(calculs.ponderationParPhase, 2)}
                aide="Durée de l'activité / durée totale du projet"
              />
            </div>
          </div>
        )}

        {etapeActive === 'planning' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Dates et gabarit d'avancement"
              aide="La courbe type dit comment l'avancement se répartit entre le début et la fin : les deux dates suffisent, le pourcentage hebdomadaire en découle."
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Start" type="date" {...texte('debut')} />
              <Input label="End" type="date" {...texte('fin')} />
              <ChampDerive
                label="Duation (d)"
                valeur={datesInversees ? 'Fin antérieure au début' : formatNombre(duree)}
                aide="Fin − début + 1, bornes incluses"
              />
            </div>
            <SelectChamp
              label="Typical S-curve"
              value={valeurs.courbeType ? String(valeurs.courbeType) : ''}
              onChange={(v) =>
                setValeurs((prev) => ({
                  ...prev,
                  courbeType: v ? (Number(v) as NumeroCourbeType) : null,
                }))
              }
            >
              {COURBES_TYPES.map((c) => (
                <option key={c.numero} value={String(c.numero)}>
                  {c.numero} — {c.nom}
                </option>
              ))}
            </SelectChamp>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ChampDerive
                label="Pondération"
                valeur={formatPercent(calculs.ponderation, 2)}
                aide="Sur la durée totale de la feuille"
              />
              <ChampDerive
                label="À mi-parcours"
                valeur={
                  valeurs.debut && duree
                    ? formatPercent(avancementPlanifie(apercu, milieu(valeurs.debut, duree)))
                    : null
                }
                aide="Avancement produit par le gabarit"
              />
              <ChampDerive
                label="À 75 % du temps"
                valeur={
                  valeurs.debut && duree
                    ? formatPercent(avancementPlanifie(apercu, milieu(valeurs.debut, duree, 0.75)))
                    : null
                }
              />
              <ChampDerive label="À la date de fin" valeur={valeurs.fin ? '100 %' : null} />
            </div>
          </div>
        )}

        {etapeActive === 'classement' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Classement et budget"
              aide="Colonnes de filtre de la feuille. Le budget vient d'une table « Coût » absente du classeur — il reste donc saisi ici, et laissé vide tant qu'il n'est pas connu."
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DatalistInput
                id="dl-scurve-type-avis"
                label="Types AVIS/DDM/SOR"
                value={texteValeur('typeAvis')}
                onChange={(v) => setTexte('typeAvis', v)}
                options={suggestions.typesAvis}
              />
              <DatalistInput
                id="dl-scurve-classification"
                label="Classification"
                value={texteValeur('classification')}
                onChange={(v) => setTexte('classification', v)}
                options={suggestions.classifications}
              />
              <DatalistInput
                id="dl-scurve-champ"
                label="Champs"
                value={texteValeur('champ')}
                onChange={(v) => setTexte('champ', v)}
                options={suggestions.champs}
              />
              <DatalistInput
                id="dl-scurve-plateforme"
                label="Plateformes"
                value={texteValeur('plateforme')}
                onChange={(v) => setTexte('plateforme', v)}
                options={suggestions.plateformes}
              />
              <DatalistInput
                id="dl-scurve-service"
                label="Services"
                value={texteValeur('service')}
                onChange={(v) => setTexte('service', v)}
                options={suggestions.services}
              />
              <SelectChamp
                label="Tests"
                value={texteValeur('tests')}
                onChange={(v) => setTexte('tests', v)}
                options={['Y', 'N']}
              />
              <ChampMontant
                label="Budget"
                devise={devise}
                value={valeurs.budget}
                onChange={(v) => setValeurs((prev) => ({ ...prev, budget: v }))}
              />
              <ChampDerive
                label="BU / Phase"
                valeur={formatNombre(calculs.buPhase)}
                aide="Budget × pondération"
              />
            </div>
          </div>
        )}

        {etapeActive === 'releves' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Avancement constaté, semaine par semaine"
              aide="Les colonnes hebdomadaires de la feuille Réalisé. Une case laissée vide n'est pas 0 % : c'est une semaine non pointée, la courbe s'y interrompt."
            />
            <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Semaine du</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500 w-32">Avancement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {semaines.map((s) => {
                    const valeur = valeurs.realiseHebdo?.[s]
                    return (
                      <tr key={s} className={valeur === undefined ? '' : 'bg-primary/5'}>
                        <td className="px-3 py-1.5 text-gray-600">{formatDate(s)}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            placeholder="%"
                            value={valeur === undefined ? '' : String(Math.round(valeur * 100))}
                            onChange={(e) => setReleve(s, e.target.value)}
                            className={miniInputClass}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <PiedEtapes
          etapes={etapes}
          active={etapeActive}
          onAller={allerEtape}
          onAnnuler={onClose}
          enregistrement={enregistrement}
          complet={manquantes.length === 0}
        />
      </form>
    </Modal>
  )
}

/** Date atteinte après `part` de la durée — sert à montrer, pendant la saisie,
 * ce que le gabarit choisi produira réellement. */
function milieu(debut: string, duree: number, part = 0.5): string {
  const date = new Date(`${debut}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + Math.round(duree * part))
  return date.toISOString().slice(0, 10)
}
