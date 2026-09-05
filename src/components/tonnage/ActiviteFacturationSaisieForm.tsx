import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { CalendarRange, FileText, HardHat, Link2, Timer } from 'lucide-react'
import type { LigneActiviteFacturation } from '../../types/facturationPoint'
import type { LigneJournalTonnage } from '../../types/tonnageEchaf'
import { repartitionPaliersAutomatique } from '../../lib/facturationPointEngine'
import { champFormClass } from '../ui/classes'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ChampDerive, EnteteSection, SelectChamp } from '../ui/ChampsSaisie'
import { EnteteEtapes, PiedEtapes } from '../ui/FlecheEtapes'
import {
  bloquerEntree,
  useEtapes,
  type DefinitionEtape,
  type EtapeAffichee,
  type EtatEtape,
} from '../../lib/etapesFormulaire'

// Formulaire de saisie de "SUIVI DES ACTIVITES" (doc/suivi tonnage.docx,
// section "SUIVI CONTRAT ECHAF") : le docx affirmait que la majeure partie
// des colonnes de cette feuille est extraite automatiquement du fichier de
// suivi des opérations (Journal montage/dépose) — vérifié le 05/08/2026 en
// analysant directement le classeur source (93 colonnes du Journal) : c'est
// vrai pour Projet/Service/Site/Longueur/Largeur/Hauteur (colonnes réelles
// du Journal), donc sélectionner un N° de demande les dérive toujours en
// lecture seule. En revanche Division/Plateforme/Imputation n'existent dans
// AUCUNE colonne du Journal réel — ces notions n'appartiennent qu'au
// classeur indépendant "Facturation au point" (dont cette feuille est
// issue), elles redeviennent donc des champs manuels ici, comme les champs
// propres à la facturation (période, heures de régie, indicateurs OUI/NON,
// lieu) déjà manuels ("Chef d'équipe (h), Coordinateur (h), Monteurs (h),
// Nuit/dépose et nuit dépose").
//
// Les paliers <15j/<30j n'apparaissent pas dans le formulaire : calculés
// automatiquement (repartitionPaliersAutomatique, lib/facturationPointEngine.ts)
// à partir du cumul de jours déjà facturés pour la même demande — la
// contrainte Excel qui obligeait à les saisir à la main n'existe plus ici.
//
// Découpé en étapes le 06/08/2026 (components/ui/FlecheEtapes.tsx), suivant
// les groupes de colonnes de la feuille : ce qui vient du Journal → la
// période facturée → les prestations facturées → la régie → les notes.

export type ActiviteFacturationSaisieInput = Omit<LigneActiviteFacturation, 'id'>

function champVide(): ActiviteFacturationSaisieInput {
  return {
    projet: null,
    numeroDemande: null,
    division: null,
    service: null,
    site: null,
    plateforme: null,
    imputation: null,
    longueur: null,
    largeur: null,
    hauteur: null,
    mois: null,
    du: null,
    au: null,
    suspendu: null,
    assistance: null,
    lieu: null,
    chefEquipeHeures: null,
    coordinateurHeures: null,
    monteursHeures: null,
    pose: null,
    nuitPose: null,
    depose: null,
    nuitDepose: null,
    ndc: null,
    joursMoins15: null,
    joursMoins30: null,
    commentaires: null,
  }
}

const optionsOuiNon = ['OUI', 'NON']
const optionsLieu = ['OFFSHORE', 'ONSHORE']

const INDICATEURS = [
  ['pose', 'Pose'],
  ['nuitPose', 'Nuit/pose'],
  ['depose', 'Dépose'],
  ['nuitDepose', 'Nuit/dépose'],
  ['ndc', 'N.D.C'],
] as const

type EtapeActivite = 'demande' | 'periode' | 'prestations' | 'regie' | 'notes'

const ETAPES: DefinitionEtape<EtapeActivite>[] = [
  { key: 'demande', label: 'Demande', icon: Link2, optionnel: false },
  { key: 'periode', label: 'Période facturée', icon: CalendarRange, optionnel: false },
  { key: 'prestations', label: 'Prestations', icon: HardHat, optionnel: false },
  { key: 'regie', label: 'Régie', icon: Timer, optionnel: true },
  { key: 'notes', label: 'Notes', icon: FileText, optionnel: true },
]

export function ActiviteFacturationSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  journal,
  activitesExistantes,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: ActiviteFacturationSaisieInput) => Promise<void>
  journal: LigneJournalTonnage[]
  activitesExistantes: LigneActiviteFacturation[]
}) {
  const [valeurs, setValeurs] = useState<ActiviteFacturationSaisieInput>(champVide)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { etapeActive, etapesVues, allerEtape, reinitialiserEtapes } = useEtapes<EtapeActivite>('demande')

  // Reset à l'ouverture ajusté pendant le rendu plutôt que dans un
  // useEffect (même pattern que JournalTonnageSaisieForm).
  const [dejaOuvert, setDejaOuvert] = useState(false)
  if (isOpen && !dejaOuvert) {
    setDejaOuvert(true)
    setValeurs(champVide())
    setErreur(null)
    reinitialiserEtapes()
  } else if (!isOpen && dejaOuvert) {
    setDejaOuvert(false)
  }

  const numerosDemande = useMemo(
    () => [...new Set(journal.map((l) => l.numeroDemande).filter((n): n is string => !!n))].sort(),
    [journal]
  )

  const ligneJournal = useMemo(
    () => journal.find((l) => l.numeroDemande === valeurs.numeroDemande) ?? null,
    [journal, valeurs.numeroDemande]
  )

  const paliers = useMemo(
    () => repartitionPaliersAutomatique(valeurs.du, valeurs.au, valeurs.numeroDemande, activitesExistantes),
    [valeurs.du, valeurs.au, valeurs.numeroDemande, activitesExistantes]
  )
  const joursLigne =
    valeurs.du && valeurs.au
      ? Math.round((new Date(valeurs.au).getTime() - new Date(valeurs.du).getTime()) / 86_400_000) + 1
      : 0
  const joursPlus30 = Math.max(0, joursLigne - paliers.joursMoins15 - paliers.joursMoins30)

  const texteValeur = (cle: keyof ActiviteFacturationSaisieInput) => (valeurs[cle] as string | null) ?? ''
  const setTexte = (cle: keyof ActiviteFacturationSaisieInput, v: string) =>
    setValeurs((prev) => ({ ...prev, [cle]: v || null }))
  const texte = (cle: keyof ActiviteFacturationSaisieInput) => ({
    value: texteValeur(cle),
    onChange: (e: ChangeEvent<HTMLInputElement>) => setTexte(cle, e.target.value),
  })
  const nombre = (cle: keyof ActiviteFacturationSaisieInput) => ({
    value: valeurs[cle] == null ? '' : String(valeurs[cle]),
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      setValeurs((prev) => ({ ...prev, [cle]: e.target.value === '' ? null : Number(e.target.value) })),
  })

  const heuresRegie = [valeurs.chefEquipeHeures, valeurs.coordinateurHeures, valeurs.monteursHeures].reduce(
    (s: number, v) => s + (v ?? 0),
    0
  )
  const indicateursRenseignes = INDICATEURS.filter(([cle]) => valeurs[cle]).length

  const etatEtape = (cle: EtapeActivite): { etat: EtatEtape; resume: string } => {
    const vue = etapesVues.includes(cle)
    switch (cle) {
      case 'demande':
        if (valeurs.numeroDemande) {
          return {
            etat: 'complet',
            resume: ligneJournal ? `${valeurs.numeroDemande} · ${ligneJournal.site ?? '—'}` : valeurs.numeroDemande,
          }
        }
        return { etat: 'vide', resume: 'Demande à sélectionner' }
      case 'periode':
        if (valeurs.du && valeurs.au) {
          return { etat: 'complet', resume: `${joursLigne} j facturés` }
        }
        return valeurs.du || valeurs.au || valeurs.mois
          ? { etat: 'partiel', resume: 'Période incomplète' }
          : { etat: 'vide', resume: 'Du … au …' }
      case 'prestations':
        if (valeurs.lieu) {
          return { etat: 'complet', resume: `${valeurs.lieu} · ${indicateursRenseignes}/5 indicateurs` }
        }
        return indicateursRenseignes > 0
          ? { etat: 'partiel', resume: 'Lieu manquant' }
          : { etat: 'vide', resume: 'Offshore / onshore' }
      case 'regie':
        if (heuresRegie > 0) return { etat: 'complet', resume: `${heuresRegie} h` }
        return vue ? { etat: 'vu', resume: 'Pas de régie' } : { etat: 'vide', resume: 'À vérifier' }
      case 'notes':
        if (valeurs.commentaires) return { etat: 'complet', resume: 'Commentaire saisi' }
        return vue ? { etat: 'vu', resume: 'RAS' } : { etat: 'vide', resume: 'À vérifier' }
    }
  }

  const etapes: EtapeAffichee<EtapeActivite>[] = ETAPES.map((e) => ({ ...e, ...etatEtape(e.key) }))
  const manquantes = etapes.filter((e) => !e.optionnel && e.etat !== 'complet')

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
      await onSubmit({
        ...valeurs,
        projet: ligneJournal?.projet ?? null,
        service: ligneJournal?.services ?? null,
        site: ligneJournal?.site ?? null,
        longueur: ligneJournal?.longueurReelle ?? null,
        largeur: ligneJournal?.largeurReelle ?? null,
        hauteur: ligneJournal?.hauteurReelle ?? null,
        joursMoins15: paliers.joursMoins15,
        joursMoins30: paliers.joursMoins30,
      })
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouvelle ligne de facturation" maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} onKeyDown={bloquerEntree(etapes, etapeActive)} className="space-y-5">
        <EnteteEtapes etapes={etapes} active={etapeActive} onSelect={allerEtape} manquantes={manquantes} />

        {etapeActive === 'demande' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Demande facturée"
              aide="Sélectionner la demande du Journal montage/dépose : projet, service, site et cotes en sont repris automatiquement."
            />
            <div>
              <label className="block text-sm font-medium mb-1.5 text-gray-500">N° de demande</label>
              <input
                list="dl-numero-demande-facturation"
                value={texteValeur('numeroDemande')}
                onChange={(e) => setTexte('numeroDemande', e.target.value)}
                placeholder="Sélectionner une demande du Journal montage/dépose"
                className={champFormClass}
              />
              <datalist id="dl-numero-demande-facturation">
                {numerosDemande.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              {!ligneJournal && valeurs.numeroDemande && (
                <p className="mt-1.5 text-xs text-amber-600">
                  Aucune demande correspondante dans le Journal montage/dépose — les champs dérivés resteront vides.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <ChampDerive label="Projet" valeur={ligneJournal?.projet ?? null} />
              <ChampDerive label="Service" valeur={ligneJournal?.services ?? null} />
              <ChampDerive label="Site" valeur={ligneJournal?.site ?? null} />
              <ChampDerive label="Longueur" valeur={ligneJournal?.longueurReelle ?? null} />
              <ChampDerive label="Largeur" valeur={ligneJournal?.largeurReelle ?? null} />
              <ChampDerive label="Hauteur" valeur={ligneJournal?.hauteurReelle ?? null} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Division" {...texte('division')} />
              <Input label="Plateforme" {...texte('plateforme')} />
              <Input label="Imputation" {...texte('imputation')} />
            </div>
            <p className="text-xs text-gray-400">
              Division, plateforme et imputation n'existent pas dans le Journal : elles restent manuelles.
            </p>
          </div>
        )}

        {etapeActive === 'periode' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Période facturée"
              aide="La facturation s'arrête à la dépose réelle, sauf notification formelle antérieure. Une même demande peut être facturée sur plusieurs mois, sans doublon."
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Mois" type="date" {...texte('mois')} />
              <Input label="Facturation du" type="date" {...texte('du')} />
              <Input label="...au" type="date" {...texte('au')} />
            </div>
            {ligneJournal && (ligneJournal.dateDeposeReel || ligneJournal.dateNotificationDepose) && (
              <p className="text-xs text-gray-400">
                Repère (Journal) : dépose réelle {ligneJournal.dateDeposeReel ?? '—'} · notification dépose{' '}
                {ligneJournal.dateNotificationDepose ?? '—'}
              </p>
            )}
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-xs text-gray-600">
              Répartition des paliers calculée automatiquement : <strong>{joursLigne}</strong> j facturés — {'<15j : '}
              <strong>{paliers.joursMoins15}</strong> · {'<30j : '}
              <strong>{paliers.joursMoins30}</strong> · {'>30j : '}
              <strong>{joursPlus30}</strong>
            </div>
          </div>
        )}

        {etapeActive === 'prestations' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Prestations facturées"
              aide="Le lieu détermine le tarif du point et les coefficients de nuit — il conditionne tout le calcul du coût."
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SelectChamp
                label="Lieu"
                value={texteValeur('lieu')}
                onChange={(v) => setTexte('lieu', v)}
                options={optionsLieu}
              />
              <SelectChamp
                label="Suspendu"
                value={texteValeur('suspendu')}
                onChange={(v) => setTexte('suspendu', v)}
                options={optionsOuiNon}
              />
              <SelectChamp
                label="Assistance respiratoire"
                value={texteValeur('assistance')}
                onChange={(v) => setTexte('assistance', v)}
                options={optionsOuiNon}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {INDICATEURS.map(([cle, label]) => (
                <SelectChamp
                  key={cle}
                  label={label}
                  value={texteValeur(cle)}
                  onChange={(v) => setTexte(cle, v)}
                  options={optionsOuiNon}
                />
              ))}
            </div>
          </div>
        )}

        {etapeActive === 'regie' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Heures de régie"
              aide="Facultatif — seulement si des heures de personnel sont facturées en régie sur cette période."
            />
            <div className="grid grid-cols-3 gap-4">
              <Input label="Chef d'équipe (h)" type="number" step="0.5" {...nombre('chefEquipeHeures')} />
              <Input label="Coordinateur (h)" type="number" step="0.5" {...nombre('coordinateurHeures')} />
              <Input label="Monteurs (h)" type="number" step="0.5" {...nombre('monteursHeures')} />
            </div>
          </div>
        )}

        {etapeActive === 'notes' && (
          <div className="space-y-4">
            <EnteteSection titre="Commentaires" aide="Facultatif — laisser vide si rien à signaler." />
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
          libelleSubmit="Enregistrer la ligne"
        />
      </form>
    </Modal>
  )
}
