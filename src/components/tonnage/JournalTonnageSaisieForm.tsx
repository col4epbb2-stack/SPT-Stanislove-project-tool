import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { CalendarClock, FileText, Ruler, Tag } from 'lucide-react'
import type { LigneJournalTonnage, TonnageContrat } from '../../types/tonnageEchaf'
import { MODES_FACTURATION_TONNAGE, VALEURS_MODIFICATION_TONNAGE } from '../../types/tonnageEchaf'
import { m3Reel, poidsContractuel, productionDuJourTonnage } from '../../lib/tonnageEchafEngine'
import { aujourdHui } from '../../lib/saisie'
import { formatNombre } from '../../lib/format'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ChampDerive, DatalistInput, EnteteSection, SelectChamp } from '../ui/ChampsSaisie'
import { EnteteEtapes, PiedEtapes } from '../ui/FlecheEtapes'
import { SelecteurFicheProjet } from '../projects/SelecteurFicheProjet'
import {
  bloquerEntree,
  useEtapes,
  type DefinitionEtape,
  type EtapeAffichee,
  type EtatEtape,
} from '../../lib/etapesFormulaire'

// Formulaire de saisie du Journal montage/dépose (doc/suivi tonnage.docx,
// section "SUIVI OPERATIONNEL") : reprend exactement les champs que le docx
// désigne comme saisis manuellement, plus `eligible` (05/08/2026 : absent du
// docx mais confirmé comme champ manuel brut en analysant directement le
// classeur source, cf. plan — valeurs réelles "Elible"/"NON", pas une
// formule). `m3Reel`/`poidsT` restent hors formulaire (formules du classeur,
// aucune saisie correspondante) — nuls sur les lignes saisies depuis l'app,
// comme les autres champs jamais inventés dans ce projet ; ils sont
// simplement affichés en lecture seule dans l'étape "Dimensions" pour que le
// tonnage qui découle des cotes soit visible au moment où on les saisit.
// `dateDeposePrev` est conservé bien qu'absent de la liste du docx :
// indispensable au calcul retard/perte déjà en place
// (lib/tonnageEchafEngine.ts).
//
// Division/Plateforme/Imputation retirés du type le 05/08/2026 : en
// analysant le classeur source, ces 3 notions n'existent dans AUCUNE des 93
// colonnes du Journal réel — elles n'appartiennent qu'au classeur
// indépendant "Facturation au point" (cf. ActiviteFacturationSaisieForm, où
// elles redeviennent manuelles).
//
// Une même demande a un cycle de vie (créée → montée → notifiée → déposée) :
// contrairement au journal CRJ (pur ajout), ce formulaire sert aussi bien à
// créer une nouvelle demande qu'à compléter une demande existante (passer
// `ligneInitiale` pour pré-remplir, ex. ajouter la date de dépose réelle
// plus tard) — l'enregistrement upserte sur la même clé (numéro de demande).
//
// Découpé en étapes le 06/08/2026 (même parcours que le CRJ, cf.
// components/ui/FlecheEtapes.tsx) : 20 champs d'un bloc dans une modale ne
// disaient pas ce qui restait à remplir, alors que le suivi d'une demande
// impose justement de tout renseigner. Le découpage suit les groupes de
// colonnes de la feuille : identification → cycle de vie → cotes → notes.

export type JournalTonnageSaisieInput = Omit<LigneJournalTonnage, 'id'>

function champVide(): JournalTonnageSaisieInput {
  return {
    projet: null,
    champs: null,
    modeFacturation: null,
    date: aujourdHui(),
    numeroDemande: null,
    demandeurTeepg: null,
    site: null,
    services: null,
    typeEchafaudage: null,
    dateMontagePrev: null,
    dateMontageReel: null,
    dateDeposePrev: null,
    dateNotificationDepose: null,
    dateDeposeReel: null,
    eligible: null,
    statut: null,
    longueurReelle: null,
    largeurReelle: null,
    hauteurReelle: null,
    m3Reel: null,
    poidsT: null,
    description: null,
    modification: null,
    commentaires: null,
  }
}

export interface JournalTonnageSuggestions {
  champs: string[]
  // Mode de facturation : liste fermée (`MODES_FACTURATION_TONNAGE`,
  // TON1-39, lot 5) — n'est plus une suggestion, plus de champ ici.
  sites: string[]
  services: string[]
  typesEchafaudage: string[]
  statuts: string[]
  /**
   * Noms de projets déjà rencontrés — Journal **et** fiches du module PROJET
   * (03/09/2026, lot 5, TON1-38 : « l'objectif est que le nom du projet
   * renseigné dans le journal soit identique à celui utilisé dans le module
   * PROJET »). Le champ reste une frappe libre (`DatalistInput`) : un
   * chantier sans fiche ni antécédent doit rester saisissable.
   */
  projets: string[]
}

type EtapeJournal = 'identification' | 'cycle' | 'dimensions' | 'notes'

const ETAPES: DefinitionEtape<EtapeJournal>[] = [
  { key: 'identification', label: 'Identification', icon: Tag, optionnel: false },
  { key: 'cycle', label: 'Cycle de vie', icon: CalendarClock, optionnel: false },
  { key: 'dimensions', label: 'Dimensions', icon: Ruler, optionnel: false },
  { key: 'notes', label: 'Notes', icon: FileText, optionnel: true },
]

export function JournalTonnageSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  suggestions,
  ligneInitiale,
  contrat,
  defaut,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: JournalTonnageSaisieInput) => Promise<void>
  suggestions: JournalTonnageSuggestions
  ligneInitiale?: LigneJournalTonnage | null
  contrat: TonnageContrat
  /**
   * Date et champ à pré-remplir à la création (03/09/2026, lot 3 — ouvert
   * depuis un rapport journalier déjà situé sur ce jour et ce champ). Sans
   * effet en modification : `ligneInitiale` fait alors foi.
   */
  defaut?: { date?: string; champs?: string }
}) {
  const [valeurs, setValeurs] = useState<JournalTonnageSaisieInput>(champVide)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { etapeActive, etapesVues, allerEtape, reinitialiserEtapes } = useEtapes<EtapeJournal>('identification')

  // Pré-remplissage à l'ouverture (création ou édition) ajusté pendant le
  // rendu plutôt que dans un useEffect (recommandation React : éviter un
  // setState synchrone dans un effet, qui déclenche un rendu en cascade) —
  // même pattern que `derniereAffaireVeilleId` dans SuiviHebdoCrjPage.tsx.
  const [cleAppliquee, setCleAppliquee] = useState<string | null>(null)
  const cleCourante = isOpen ? String(ligneInitiale?.id ?? 'nouveau') : null
  if (cleCourante !== null && cleCourante !== cleAppliquee) {
    setCleAppliquee(cleCourante)
    setErreur(null)
    reinitialiserEtapes()
    if (ligneInitiale) {
      const { id, ...reste } = ligneInitiale
      void id
      setValeurs(reste)
    } else {
      setValeurs({ ...champVide(), ...(defaut?.date ? { date: defaut.date } : {}), ...(defaut?.champs ? { champs: defaut.champs } : {}) })
    }
  } else if (cleCourante === null && cleAppliquee !== null) {
    setCleAppliquee(null)
  }

  const texteValeur = (cle: keyof JournalTonnageSaisieInput) => (valeurs[cle] as string | null) ?? ''

  const setTexte = (cle: keyof JournalTonnageSaisieInput, v: string) =>
    setValeurs((prev) => ({ ...prev, [cle]: v || null }))

  const texte = (cle: keyof JournalTonnageSaisieInput) => ({
    value: texteValeur(cle),
    onChange: (e: ChangeEvent<HTMLInputElement>) => setTexte(cle, e.target.value),
  })

  const nombre = (cle: keyof JournalTonnageSaisieInput) => ({
    value: valeurs[cle] == null ? '' : String(valeurs[cle]),
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      setValeurs((prev) => ({ ...prev, [cle]: e.target.value === '' ? null : Number(e.target.value) })),
  })

  // Cotes → M3 puis poids contractuel : mêmes formules que la feuille
  // (lib/tonnageEchafEngine.ts), affichées en direct pendant la saisie.
  const ligneEnCours: LigneJournalTonnage = { id: ligneInitiale?.id ?? 'nouveau', ...valeurs }
  const m3 = m3Reel(ligneEnCours)
  const poids = poidsContractuel(ligneEnCours, contrat)
  // Une modification déclarée fait de cette ligne, à elle seule, la
  // production du jour — TON1-41, résolution de Q11 (les cotes décrivent la
  // modification, pas l'ouvrage entier).
  const productionDuJour = productionDuJourTonnage(ligneEnCours, contrat)

  // Mode de facturation : liste fermée (TON1-39), sauf une valeur déjà
  // saisie qui n'y figurerait pas — la retirer effacerait une saisie
  // existante.
  const modesConnus: readonly string[] = MODES_FACTURATION_TONNAGE
  const optionsMode =
    valeurs.modeFacturation && !modesConnus.includes(valeurs.modeFacturation)
      ? [...modesConnus, valeurs.modeFacturation]
      : [...modesConnus]

  const datesRenseignees = [
    valeurs.dateMontagePrev,
    valeurs.dateMontageReel,
    valeurs.dateDeposePrev,
    valeurs.dateNotificationDepose,
    valeurs.dateDeposeReel,
  ].filter(Boolean).length
  const cotesRenseignees = [valeurs.longueurReelle, valeurs.largeurReelle, valeurs.hauteurReelle].filter(
    (v) => v != null
  ).length

  const etatEtape = (cle: EtapeJournal): { etat: EtatEtape; resume: string } => {
    const vue = etapesVues.includes(cle)
    switch (cle) {
      case 'identification': {
        if (valeurs.numeroDemande && valeurs.date) {
          return { etat: 'complet', resume: `${valeurs.numeroDemande} · ${valeurs.site ?? 'site ?'}` }
        }
        return valeurs.projet || valeurs.champs || valeurs.site
          ? { etat: 'partiel', resume: 'N° de demande manquant' }
          : { etat: 'vide', resume: 'Demande à identifier' }
      }
      case 'cycle': {
        if (valeurs.statut && datesRenseignees > 0) {
          return { etat: 'complet', resume: `${valeurs.statut} · ${datesRenseignees} date(s)` }
        }
        return valeurs.statut || datesRenseignees > 0
          ? { etat: 'partiel', resume: valeurs.statut ? 'Aucune date' : 'Statut manquant' }
          : { etat: 'vide', resume: 'Statut et dates' }
      }
      case 'dimensions': {
        if (cotesRenseignees === 3) {
          const suffixe = valeurs.modification === 'OUI' ? ' · Modification' : ''
          return { etat: 'complet', resume: `${formatNombre(m3, 2)} m³ · ${formatNombre(poids, 3)} T${suffixe}` }
        }
        return cotesRenseignees > 0
          ? { etat: 'partiel', resume: `${cotesRenseignees}/3 cotes` }
          : { etat: 'vide', resume: 'L × l × H' }
      }
      case 'notes': {
        // `modification` a quitté cette étape pour « Dimensions » (TON1-40) :
        // elle ne compte plus dans son résumé, sous peine de deux étapes qui
        // se disputent le même signal.
        const remplies = [valeurs.description, valeurs.commentaires].filter(Boolean).length
        if (remplies > 0) return { etat: 'complet', resume: `${remplies} note(s)` }
        return vue ? { etat: 'vu', resume: 'RAS' } : { etat: 'vide', resume: 'À vérifier' }
      }
    }
  }

  const etapes: EtapeAffichee<EtapeJournal>[] = ETAPES.map((e) => ({ ...e, ...etatEtape(e.key) }))
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
        ligneInitiale ? `Modifier la demande ${ligneInitiale.numeroDemande ?? ''}` : 'Nouvelle demande d’échafaudage'
      }
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} onKeyDown={bloquerEntree(etapes, etapeActive)} className="space-y-5">
        <EnteteEtapes etapes={etapes} active={etapeActive} onSelect={allerEtape} manquantes={manquantes} />

        {/* Visible dans les 4 étapes (03/09/2026, lot 5, TON1-42 : « quand on
            passe au cycle de vie, je souhaite quand même que le numéro de la
            demande soit affiché […] valable pour les autres onglets
            (dimension + note) ») — jusqu'ici il ne se lisait qu'en résumé de
            la chevron « Identification », donc seulement quand on l'a
            quittée sans y être. */}
        {etapeActive !== 'identification' && (
          <p className="text-xs text-gray-500 -mt-2">
            Demande{' '}
            {valeurs.numeroDemande ? (
              <span className="font-medium text-gray-700">n° {valeurs.numeroDemande}</span>
            ) : (
              'sans numéro (à renseigner à l’étape Identification)'
            )}
          </p>
        )}

        {etapeActive === 'identification' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Identification de la demande"
              aide="Le n° de demande est la clé de suivi : c'est lui qui relie le montage, la dépose et la facturation d'un même échafaudage."
            />
            <SelecteurFicheProjet
              valeur={valeurs.projetId}
              onChange={(projet) =>
                setValeurs((prev) => ({
                  ...prev,
                  projetId: projet?.id ?? null,
                  // Le libellé reste modifiable : le classeur porte souvent un
                  // intitulé de chantier différent du nom de la fiche.
                  projet: projet ? projet.nom : prev.projet,
                }))
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="N° de demande" {...texte('numeroDemande')} required />
              <Input label="Date du reporting" type="date" {...texte('date')} required />
              <DatalistInput
                id="dl-projet"
                label="Projet"
                value={texteValeur('projet')}
                onChange={(v) => setTexte('projet', v)}
                options={suggestions.projets}
              />
              <DatalistInput
                id="dl-champ"
                label="Champ"
                value={texteValeur('champs')}
                onChange={(v) => setTexte('champs', v)}
                options={suggestions.champs}
              />
              <SelectChamp
                label="Mode de facturation"
                value={texteValeur('modeFacturation')}
                onChange={(v) => setTexte('modeFacturation', v)}
                options={optionsMode}
              />
              <Input label="Demandeur TEEPG" {...texte('demandeurTeepg')} />
              <DatalistInput
                id="dl-site"
                label="Site"
                value={texteValeur('site')}
                onChange={(v) => setTexte('site', v)}
                options={suggestions.sites}
              />
              <DatalistInput
                id="dl-service"
                label="Service"
                value={texteValeur('services')}
                onChange={(v) => setTexte('services', v)}
                options={suggestions.services}
              />
              <DatalistInput
                id="dl-type-echaf"
                label="Type d'échafaudage"
                value={texteValeur('typeEchafaudage')}
                onChange={(v) => setTexte('typeEchafaudage', v)}
                options={suggestions.typesEchafaudage}
              />
            </div>
          </div>
        )}

        {etapeActive === 'cycle' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Cycle de vie de l'échafaudage"
              aide="Créée → montée → notifiée → déposée. La notification de dépose arrête la facturation même si l'échafaudage est encore monté ; l'écart avec la dépose réelle alimente le saving démontage."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DatalistInput
                id="dl-statut"
                label="Statut"
                value={texteValeur('statut')}
                onChange={(v) => setTexte('statut', v)}
                options={suggestions.statuts}
              />
              <SelectChamp
                label="Eligible"
                value={texteValeur('eligible')}
                onChange={(v) => setTexte('eligible', v)}
                options={['Eligible', 'NON']}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Input label="Montage prévu" type="date" {...texte('dateMontagePrev')} />
              <Input label="Montage réel" type="date" {...texte('dateMontageReel')} />
              <Input label="Dépose prévue" type="date" {...texte('dateDeposePrev')} />
              <Input label="Notification dépose" type="date" {...texte('dateNotificationDepose')} />
              <Input label="Dépose réelle" type="date" {...texte('dateDeposeReel')} />
            </div>
          </div>
        )}

        {etapeActive === 'dimensions' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Cotes de l'échafaudage"
              aide="Seules les 3 cotes sont saisies : le volume et le poids contractuel en découlent par formule, comme dans le classeur."
            />
            <div className="grid grid-cols-3 gap-4">
              <Input label="Longueur (m)" type="number" step="0.01" {...nombre('longueurReelle')} />
              <Input label="Largeur (m)" type="number" step="0.01" {...nombre('largeurReelle')} />
              <Input label="Hauteur (m)" type="number" step="0.01" {...nombre('hauteurReelle')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ChampDerive label="M3 réel" valeur={m3 != null ? formatNombre(m3, 2) : null} aide="L × l × H" />
              <ChampDerive
                label="Poids contractuel (T)"
                valeur={poids != null ? formatNombre(poids, 3) : null}
                aide={`M3 × ${formatNombre(contrat.densiteKgParM3)} kg/m³ ÷ 1000`}
              />
            </div>
            {/* Sortie de l'étape « Notes » (03/09/2026, lot 5, TON1-40 :
                « elle commande un calcul ») et rangée ici, à côté du poids
                dont elle décide — une équipe intervient sur un échafaudage
                déjà monté (ajout, extension, déplacement, adaptation). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectChamp
                label="Modification"
                value={texteValeur('modification')}
                onChange={(v) => setTexte('modification', v)}
                options={[...VALEURS_MODIFICATION_TONNAGE]}
              />
              {valeurs.modification === 'OUI' && (
                <ChampDerive
                  label="Production du jour (T)"
                  valeur={productionDuJour != null ? formatNombre(productionDuJour, 3) : null}
                  aide="Modification déclarée : la production du jour est le poids contractuel de cette ligne."
                />
              )}
            </div>
          </div>
        )}

        {etapeActive === 'notes' && (
          <div className="space-y-4">
            <EnteteSection titre="Description et suivi" aide="Facultatif — laisser vide si rien à signaler." />
            <Input label="Description des travaux" {...texte('description')} />
            <Input label="Commentaires" {...texte('commentaires')} />
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
          libelleSubmit={ligneInitiale ? 'Enregistrer les modifications' : 'Enregistrer la demande'}
        />
      </form>
    </Modal>
  )
}
