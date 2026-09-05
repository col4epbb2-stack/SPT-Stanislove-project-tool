import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { CalendarDays, FileText, Timer, UserRound } from 'lucide-react'
import type {
  LigneJournalTonnage,
  LignePersonnelTonnage,
  ParametresContratTonnage,
  PersonnelAnnexe,
} from '../../types/tonnageEchaf'
import { MODES_FACTURATION_TONNAGE } from '../../types/tonnageEchaf'
import { derivePersonnelTonnage } from '../../lib/tonnageEchafEngine'
import { coefficientDuProfil, objectifDeLaLigne } from '../../lib/tonnageProductivite'
import { projetsDuJournal, serviceDuProjetJournal } from '../../lib/contratTonnageRapports'
import { aujourdHui } from '../../lib/saisie'
import { formatNombre, formatPercent } from '../../lib/format'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ChampDerive, DatalistInput, EnteteSection, SelectChamp } from '../ui/ChampsSaisie'
import { EnteteEtapes, PiedEtapes } from '../ui/FlecheEtapes'
import {
  bloquerEntree,
  useEtapes,
  type DefinitionEtape,
  type EtapeAffichee,
  type EtatEtape,
} from '../../lib/etapesFormulaire'

// Saisie du "Suivi personnel" (06/08/2026) — l'onglet n'avait aucun point de
// saisie jusqu'ici alors que c'est le pendant du Journal montage/dépose côté
// personnel : le tonnage dit ce qui a été monté, le pointage dit avec quel
// effectif et combien d'heures perdues en standby (NPT). Les deux ensemble
// sont ce que le contrat valorise.
//
// Comme partout dans le projet, le formulaire ne demande QUE les colonnes
// réellement manuelles de la feuille. Les colonnes calculées sont dérivées et
// affichées en direct plutôt que ressaisies.
//
// **Deux moteurs cohabitent depuis le 03/09/2026 (lot 2, doc/Suivi tonnage
// rev01.docx)** et il faut savoir lequel dit quoi :
//   - `derivePersonnelTonnage` (lib/tonnageEchafEngine.ts) reproduit le
//     classeur — vérifié à 0 écart sur les 3 384 lignes. Il reste la source des
//     colonnes écrites en base, donc de ce que liront les écrans qui ne
//     recalculent pas.
//   - `objectifDeLaLigne` (lib/tonnageProductivite.ts) applique la règle du
//     document : l'objectif de l'équipe est **réparti sur l'effectif du jour**,
//     ce qui fait dépendre l'objectif d'une personne de qui d'autre est pointé.
//     C'est lui qui s'affiche, et c'est lui qui fait autorité à l'écran.
// Les deux coïncident exactement sur l'équipe de référence (1 chef + 2
// monteurs) et divergent au-delà — arbitrage explicite de l'utilisateur
// (Q1 du recueil).
//
// **La productivité n'est plus saisie** : c'est le coefficient du profil, qui
// se règle désormais dans Paramètres › Tonnage échafaudage. Elle ne redevient
// un champ que pour un profil qu'aucun référentiel ne connaît — on n'invente
// pas un coefficient, mais on ne bloque pas non plus la saisie.

export type PersonnelTonnageSaisieInput = Omit<LignePersonnelTonnage, 'id'>

export interface PersonnelTonnageSuggestions {
  champs: string[]
  // Mode de facturation : liste fermée (`MODES_FACTURATION_TONNAGE`,
  // TON1-27, lot 5) — n'est plus une suggestion, plus de champ ici.
  sites: string[]
  services: string[]
  profils: string[]
  noms: string[]
  // Projet : voir `journal` prop, la liste du jour prime (TON1-29).
  projets: string[]
  numerosDemande: string[]
}

type EtapePersonnel = 'journee' | 'intervenant' | 'temps' | 'notes'

const ETAPES: DefinitionEtape<EtapePersonnel>[] = [
  { key: 'journee', label: 'Journée', icon: CalendarDays, optionnel: false },
  { key: 'intervenant', label: 'Intervenant', icon: UserRound, optionnel: false },
  { key: 'temps', label: 'Temps & standby', icon: Timer, optionnel: false },
  { key: 'notes', label: 'Notes', icon: FileText, optionnel: true },
]

interface Brouillon {
  date: string
  projet: string
  champs: string
  modeFacturation: string
  numeroDemande: string
  site: string
  services: string
  nom: string
  profil: string
  productivite: string
  nombreHeures: string
  standby: string
  commentaires: string
}

function brouillonVide(): Brouillon {
  return {
    date: aujourdHui(),
    projet: '',
    champs: '',
    modeFacturation: '',
    numeroDemande: '',
    site: '',
    services: '',
    nom: '',
    profil: '',
    productivite: '',
    nombreHeures: '',
    standby: '',
    commentaires: '',
  }
}

function nombreOuNull(v: string): number | null {
  return v.trim() === '' ? null : Number(v)
}

export function PersonnelTonnageSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  suggestions,
  annexe,
  parametres,
  journal,
  effectifDuJour,
  productivitePourProfil,
  defaut,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: PersonnelTonnageSaisieInput) => Promise<void>
  suggestions: PersonnelTonnageSuggestions
  annexe: PersonnelAnnexe
  parametres: ParametresContratTonnage
  /** Journal montage/dépose déjà chargé — sert à limiter le menu « Projet »
   *  à ceux du jour et à en déduire le service (03/09/2026, lot 5, TON1-29). */
  journal: LigneJournalTonnage[]
  /** Pointages déjà enregistrés ce jour-là sur ce champ — l'effectif auquel la
   *  personne saisie vient s'ajouter. */
  effectifDuJour: (date: string, champ: string | null) => LignePersonnelTonnage[]
  // Productivité déjà utilisée pour ce profil dans les lignes existantes —
  // repli quand les paramètres du contrat ne déclarent pas le profil (un profil
  // inconnu reste à renseigner à la main plutôt que d'hériter d'un coefficient
  // inventé).
  productivitePourProfil: (profil: string) => number | null
  /** Date et champ à pré-remplir (03/09/2026, lot 3 — ouvert depuis un rapport
   *  journalier déjà situé sur ce jour et ce champ). */
  defaut?: { date?: string; champs?: string }
}) {
  const [valeurs, setValeurs] = useState<Brouillon>(brouillonVide)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { etapeActive, etapesVues, allerEtape, reinitialiserEtapes } = useEtapes<EtapePersonnel>('journee')

  // Reset à l'ouverture pendant le rendu (même pattern que les autres
  // formulaires de saisie du projet, pas de useEffect en cascade).
  const [dejaOuvert, setDejaOuvert] = useState(false)
  if (isOpen && !dejaOuvert) {
    setDejaOuvert(true)
    setValeurs({ ...brouillonVide(), ...(defaut?.date ? { date: defaut.date } : {}), ...(defaut?.champs ? { champs: defaut.champs } : {}) })
    setErreur(null)
    reinitialiserEtapes()
  } else if (!isOpen && dejaOuvert) {
    setDejaOuvert(false)
  }

  const maj = (patch: Partial<Brouillon>) => setValeurs((prev) => ({ ...prev, ...patch }))
  const texte = (cle: keyof Brouillon) => ({
    value: valeurs[cle],
    onChange: (e: ChangeEvent<HTMLInputElement>) => maj({ [cle]: e.target.value } as Partial<Brouillon>),
  })

  // La productivité est le coefficient du profil : elle vient des paramètres du
  // contrat, à défaut des pointages existants, et n'est saisie que si aucun des
  // deux ne connaît le profil.
  const coefficientParametre = coefficientDuProfil(parametres, valeurs.profil)
  const coefficientHabituel = valeurs.profil ? productivitePourProfil(valeurs.profil) : null
  const coefficientConnu = coefficientParametre ?? coefficientHabituel
  const origineCoefficient =
    coefficientParametre !== null
      ? 'Coefficient du profil — paramètres du contrat'
      : coefficientHabituel !== null
        ? 'Coefficient repris des pointages existants'
        : null
  const productivite = coefficientConnu ?? nombreOuNull(valeurs.productivite)

  const choisirProfil = (profil: string) => maj({ profil })

  // L'effectif du jour, la personne en cours de saisie comprise : c'est lui qui
  // porte la capacité productive, donc l'objectif de chacun. Une correction
  // (même date, même nom, même n° de demande) remplace la ligne existante au
  // lieu de s'y ajouter — c'est la clé d'upsert de la collection.
  const EN_COURS = '__saisie-en-cours__'
  const ligneEnCours = {
    id: EN_COURS,
    date: valeurs.date,
    champs: valeurs.champs || null,
    profil: valeurs.profil || null,
    nombreHeures: nombreOuNull(valeurs.nombreHeures),
    standby: nombreOuNull(valeurs.standby),
  }
  const memeCle = (l: LignePersonnelTonnage) =>
    l.date === valeurs.date &&
    (l.nom ?? '') === valeurs.nom &&
    (l.numeroDemande ?? '') === valeurs.numeroDemande
  const effectif = [
    ...effectifDuJour(valeurs.date, valeurs.champs || null).filter((l) => !memeCle(l)),
    ligneEnCours,
  ]
  const objectif = objectifDeLaLigne(ligneEnCours, effectif, parametres)

  // Colonnes écrites en base : elles restent celles du classeur
  // (`derivePersonnelTonnage`), pour que ce que porte le document Firestore
  // reste comparable aux 3 384 lignes importées. Ce que l'écran affiche vient
  // du modèle du document (`objectif`), qui est recalculé à chaque affichage —
  // et c'est ce qui permet à un changement d'objectif ou d'effectif de se
  // répercuter sans réécrire une ligne.
  const derive = derivePersonnelTonnage(
    {
      champs: valeurs.champs || null,
      productivite,
      nombreHeures: nombreOuNull(valeurs.nombreHeures),
      standby: nombreOuNull(valeurs.standby),
    },
    annexe
  )
  const champConnu = annexe.heuresProductivite.some((h) => h.champ === valeurs.champs)
  const champParametre = parametres.champs.some((c) => c.champ === valeurs.champs)

  // Projet : la liste du jour prime (TON1-29), l'historique complet ne sert
  // que de repli si rien n'a encore été saisi au Journal ce jour-là — un
  // menu vide n'aiderait personne.
  const projetsJour = projetsDuJournal(journal, valeurs.date, valeurs.champs || null)
  const optionsProjet = projetsJour.length > 0 ? projetsJour : suggestions.projets
  // Service : déduit du projet choisi dès que le Journal du jour ne laisse
  // aucune ambiguïté (« si on a choisi le projet c'est que l'information sur
  // le service on l'a déjà », TON1-29) — sinon la saisie manuelle reste le
  // repli, comme partout dans ce projet quand une dérivation ne peut pas
  // trancher.
  const serviceDerive = valeurs.projet
    ? serviceDuProjetJournal(journal, valeurs.date, valeurs.champs || null, valeurs.projet)
    : null
  // Mode de facturation : liste fermée à deux valeurs (TON1-27/39), sauf une
  // valeur déjà saisie qui n'y figurerait pas — la retirer effacerait une
  // saisie existante.
  const modesConnus: readonly string[] = MODES_FACTURATION_TONNAGE
  const optionsMode =
    valeurs.modeFacturation && !modesConnus.includes(valeurs.modeFacturation)
      ? [...modesConnus, valeurs.modeFacturation]
      : [...modesConnus]

  const etatEtape = (cle: EtapePersonnel): { etat: EtatEtape; resume: string } => {
    const vue = etapesVues.includes(cle)
    switch (cle) {
      case 'journee':
        if (valeurs.date && valeurs.champs) {
          return { etat: 'complet', resume: `${valeurs.date} · ${valeurs.champs}` }
        }
        return valeurs.date || valeurs.projet
          ? { etat: 'partiel', resume: 'Champ manquant' }
          : { etat: 'vide', resume: 'Date et champ' }
      case 'intervenant':
        if (valeurs.nom && valeurs.profil) {
          return { etat: 'complet', resume: `${valeurs.nom} — ${valeurs.profil}` }
        }
        return valeurs.nom || valeurs.profil
          ? { etat: 'partiel', resume: valeurs.nom ? 'Profil manquant' : 'Nom manquant' }
          : { etat: 'vide', resume: 'Qui a pointé' }
      case 'temps': {
        const heures = nombreOuNull(valeurs.nombreHeures)
        if (heures != null && heures > 0) {
          return {
            etat: 'complet',
            resume: `${formatNombre(heures)}h · NPT ${formatPercent(objectif.npt)}`,
          }
        }
        return valeurs.standby !== ''
          ? { etat: 'partiel', resume: 'Heures travaillées manquantes' }
          : { etat: 'vide', resume: 'Heures et standby' }
      }
      case 'notes':
        if (valeurs.commentaires) return { etat: 'complet', resume: 'Commentaire saisi' }
        return vue ? { etat: 'vu', resume: 'RAS' } : { etat: 'vide', resume: 'À vérifier' }
    }
  }

  const etapes: EtapeAffichee<EtapePersonnel>[] = ETAPES.map((e) => ({ ...e, ...etatEtape(e.key) }))
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
        date: valeurs.date,
        projet: valeurs.projet || null,
        champs: valeurs.champs || null,
        modeFacturation: valeurs.modeFacturation || null,
        numeroDemande: valeurs.numeroDemande || null,
        site: valeurs.site || null,
        services: serviceDerive ?? (valeurs.services || null),
        nom: valeurs.nom || null,
        profil: valeurs.profil || null,
        productivite,
        nombreHeures: nombreOuNull(valeurs.nombreHeures),
        standby: nombreOuNull(valeurs.standby),
        commentaires: valeurs.commentaires || null,
        ...derive,
      })
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouveau pointage personnel" maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} onKeyDown={bloquerEntree(etapes, etapeActive)} className="space-y-5">
        <EnteteEtapes etapes={etapes} active={etapeActive} onSelect={allerEtape} manquantes={manquantes} />

        {etapeActive === 'journee' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Journée pointée"
              aide="Le champ (AGM / IM / TRM) porte les paramètres de productivité utilisés pour l'objectif de production."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Date" type="date" {...texte('date')} required />
              <DatalistInput
                id="dl-pers-champ"
                label="Champ"
                value={valeurs.champs}
                onChange={(v) => maj({ champs: v })}
                options={suggestions.champs}
              />
              <DatalistInput
                id="dl-pers-projet"
                label="Projet"
                value={valeurs.projet}
                onChange={(v) => maj({ projet: v })}
                options={optionsProjet}
              />
              <SelectChamp
                label="Mode de facturation"
                value={valeurs.modeFacturation}
                onChange={(v) => maj({ modeFacturation: v })}
                options={optionsMode}
              />
              <DatalistInput
                id="dl-pers-demande"
                label="N° de demande"
                value={valeurs.numeroDemande}
                onChange={(v) => maj({ numeroDemande: v })}
                options={suggestions.numerosDemande}
                placeholder="Demande du Journal montage/dépose (si applicable)"
              />
              <DatalistInput
                id="dl-pers-site"
                label="Site"
                value={valeurs.site}
                onChange={(v) => maj({ site: v })}
                options={suggestions.sites}
              />
              {serviceDerive ? (
                <ChampDerive
                  label="Service"
                  valeur={serviceDerive}
                  aide="Déduit du projet choisi, depuis le Journal montage/dépose de ce jour."
                />
              ) : (
                <DatalistInput
                  id="dl-pers-service"
                  label="Service"
                  value={valeurs.services}
                  onChange={(v) => maj({ services: v })}
                  options={suggestions.services}
                />
              )}
            </div>
            {projetsJour.length === 0 && (
              <p className="text-xs text-gray-400">
                Aucun projet saisi ce jour-là dans le Journal montage/dépose — la liste reprend l'historique complet.
              </p>
            )}
            {valeurs.champs && !champConnu && (
              <p className="text-xs text-amber-600">
                Aucun paramètre de productivité connu pour le champ « {valeurs.champs} » — l'objectif de production
                restera vide pour cette ligne.
              </p>
            )}
          </div>
        )}

        {etapeActive === 'intervenant' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Intervenant"
              aide="La productivité est le coefficient du profil (1 pour un monteur, 0,5 pour un chef d'équipe au contrat). Il vient des paramètres du contrat et n'est plus saisi ; l'objectif de l'équipe est réparti entre les personnes pointées ce jour-là au prorata de ces coefficients."
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DatalistInput
                id="dl-pers-nom"
                label="Nom"
                value={valeurs.nom}
                onChange={(v) => maj({ nom: v })}
                options={suggestions.noms}
              />
              <DatalistInput
                id="dl-pers-profil"
                label="Profil"
                value={valeurs.profil}
                onChange={choisirProfil}
                options={suggestions.profils}
              />
              {coefficientConnu !== null ? (
                <ChampDerive
                  label="Productivité (coefficient)"
                  valeur={formatNombre(coefficientConnu, 2)}
                  aide={origineCoefficient ?? undefined}
                />
              ) : (
                <Input label="Productivité (coefficient)" type="number" step="0.1" {...texte('productivite')} />
              )}
            </div>
            {valeurs.profil && coefficientConnu === null && (
              <p className="text-xs text-amber-600">
                Le profil « {valeurs.profil} » n'a de coefficient ni dans les paramètres du contrat ni dans les
                pointages existants : il est à saisir. Un chef d'équipe vaut 0,5 et un monteur 1 au contrat.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ChampDerive
                label="Objectif de production (T)"
                valeur={objectif.objectifJourT != null ? formatNombre(objectif.objectifJourT, 3) : null}
                aide="Objectif de l'équipe × coefficient ÷ capacité du jour"
              />
              <ChampDerive
                label="Objectif de production (kg)"
                valeur={objectif.objectifJourKg != null ? formatNombre(objectif.objectifJourKg, 0) : null}
                aide="1 tonne = 1 000 kg"
              />
              <ChampDerive
                label="Productivité horaire"
                valeur={
                  objectif.productiviteHoraireKg != null
                    ? `${formatNombre(objectif.productiviteHoraireKg, 2)} kg/h`
                    : null
                }
                aide="Objectif individuel ÷ nombre d'heures"
              />
            </div>
            {/* L'objectif dépend de qui d'autre est pointé ce jour-là : c'est
                le cœur de la règle retenue (§A4), et le seul endroit où on
                peut le voir avant d'enregistrer. */}
            {objectif.capaciteJour !== null && (
              <p className="text-xs text-gray-500">
                Effectif du {valeurs.date} sur {valeurs.champs || 'ce champ'} — {effectif.length} personne(s), capacité
                productive {formatNombre(objectif.capaciteJour, 2)}
                {objectif.objectifEquipeT != null && (
                  <>
                    {' '}
                    · objectif de l'équipe {formatNombre(objectif.objectifEquipeT, 2)} T, réparti entre elles
                  </>
                )}
                .
              </p>
            )}
            {objectif.profilsSansCoefficient.length > 0 && (
              <p className="text-xs text-amber-600">
                Sans coefficient ce jour-là : {objectif.profilsSansCoefficient.join(', ')}. Ces personnes ne comptent
                pas dans la capacité productive, l'objectif des autres est donc calculé sans elles.
              </p>
            )}
            {valeurs.champs && !champParametre && (
              <p className="text-xs text-amber-600">
                Le champ « {valeurs.champs} » n'est pas déclaré dans Paramètres › Tonnage échafaudage : aucun objectif
                de production n'y est défini.
              </p>
            )}
          </div>
        )}

        {etapeActive === 'temps' && (
          <div className="space-y-4">
            <EnteteSection
              titre="Temps travaillé et standby"
              aide="Le standby est le temps d'inactivité subi dans la journée pointée : c'est lui qui donne le NPT, seule donnée d'inactivité réellement mesurée du module."
            />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Nombre d'heures" type="number" step="0.5" min="0" {...texte('nombreHeures')} />
              <Input label="Standby (h)" type="number" step="0.5" min="0" {...texte('standby')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ChampDerive
                label="NPT (h)"
                valeur={objectif.nptHeures != null ? `${formatNombre(objectif.nptHeures)} h` : null}
                aide="Heures de présence − heures productives"
              />
              <ChampDerive
                label="NPT (%)"
                valeur={objectif.npt != null ? formatPercent(objectif.npt) : null}
                aide="Stand-by ÷ nombre d'heures"
              />
              <ChampDerive
                label="Part temps productif"
                valeur={objectif.partTempsProductif != null ? formatPercent(objectif.partTempsProductif) : null}
                aide="Heures productives ÷ heures de présence"
              />
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
          libelleSubmit="Enregistrer le pointage"
        />
      </form>
    </Modal>
  )
}
