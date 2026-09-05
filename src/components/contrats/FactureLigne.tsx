import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { ChampDatePartielle } from '../ui/ChampDatePartielle'
import { formatDatePartielle, LIBELLE_RAISON_ECART } from '../../lib/datesPartielles'
import { useMontant } from '../../lib/montantAffiche'
import { useProjects } from '../../contexts/useProjects'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { avecAjouts } from '../../lib/saisie'
import { DEPARTEMENTS_VALIDATION_DO } from '../../types/listeValeur'
import type { Commande, Facture, WorkflowFacture } from '../../types/project'
import { projetsDeCommande, projetsDeFacture } from '../../types/project'
import {
  CLES_DELAIS,
  LIBELLES_DELAIS,
  NOMBRE_ETAPES,
  delaisFacture,
  etapeCourante,
  etapesManquantes,
  raisonDelaiAbsent,
  statutFacture,
  STATUT_FACTURE_LABELS,
} from '../../lib/facturesContratEngine'
import { SelecteurProjets } from './SelecteurProjets'
import { selectClass } from './contratFormConstants'

/**
 * Une facture, son statut et son workflow de validation (`doc/module
 * contrat.docx` §5, complété par `module contrat_rev01.docx` §2, §3 et §6).
 *
 * Repliée, la ligne montre ce qui se lit d'un coup d'œil : numéro, montant HT,
 * affaires rattachées, statut **calculé** (PAYÉE / IMPAYÉE) et l'étape
 * atteinte. Dépliée, elle ouvre les sept étapes, les affaires et les délais.
 *
 * Partagée entre la fiche projet (onglet Contrats) et le module Contrats : le
 * suivi d'une facture est le même où qu'on la regarde.
 */
export function FactureLigne({
  facture,
  commande,
  projetId,
  devise,
}: {
  facture: Facture
  /** La commande porteuse : ses affaires bornent celles de la facture (rev01 §6). */
  commande: Commande
  /** `''` pour une commande sans fiche projet (doc §3). */
  projetId: string
  devise: string
}) {
  const { montant: formatMontant } = useMontant()
  const { modifierFacture, removeFacture, projects } = useProjects()
  const [ouvert, setOuvert] = useState(false)

  const statut = statutFacture(facture)
  const etape = etapeCourante(facture)
  const manquantes = etapesManquantes(facture)
  const payee = statut === 'PAYEE'
  const affaires = projetsDeFacture(facture, commande)
  const nomProjet = (id: string) => projects.find((p) => p.id === id)?.nom ?? id

  const majWorkflow = (patch: Partial<WorkflowFacture>) => {
    modifierFacture(projetId, commande.id, facture.id, { workflow: { ...(facture.workflow ?? {}), ...patch } })
  }

  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-2 py-1">
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-900"
          aria-expanded={ouvert}
        >
          {ouvert ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span className="font-mono">{facture.numero}</span>
        </button>
        {facture.date && <span className="text-gray-400">{formatDatePartielle(facture.date)}</span>}
        {[facture.service, facture.site, facture.mois].filter(Boolean).length > 0 && (
          <span className="text-gray-400">{[facture.service, facture.site, facture.mois].filter(Boolean).join(' · ')}</span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* L'étape atteinte n'est affichée que si le paiement n'a pas eu
              lieu : une facture payée a franchi tout ce qui comptait. */}
          {!payee && etape > 0 && (
            <span className="text-gray-500">
              Étape {etape}/{NOMBRE_ETAPES}
            </span>
          )}
          <Badge
            label={STATUT_FACTURE_LABELS[statut]}
            bg={payee ? 'bg-green-100' : 'bg-amber-100'}
            text={payee ? 'text-green-700' : 'text-amber-700'}
          />
          <span className="font-medium text-gray-800">{formatMontant(facture.montant, devise)}</span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Supprimer la facture « ${facture.numero} » ?`)) removeFacture(projetId, commande.id, facture.id)
            }}
            title="Supprimer la facture"
            className="text-gray-300 hover:text-red-600"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Affaires payées par cette facture (rev01 §6). Héritées de la commande
          tant que la facture n'en cite aucune — le dire évite de faire passer
          l'héritage pour une saisie. */}
      <p className="pl-5 text-gray-500">
        Affaires : {[...affaires.projetIds.map(nomProjet), ...affaires.projetsLibres].join(', ') || 'aucune'}
        {affaires.heritee && <span className="text-gray-400"> (héritées de la commande)</span>}
      </p>

      {facture.objet && <p className="text-gray-500 pl-5">{facture.objet}</p>}

      {/* Avertissement du §5 : « lorsque le paiement est réalisé, toutes les
          étapes précédentes doivent être validées ». Il signale, il ne bloque
          jamais l'enregistrement. */}
      {manquantes.length > 0 && (
        <p className="pl-5 flex items-start gap-1 text-amber-700">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          Étape(s) non validée(s) : {manquantes.join(', ')}.
        </p>
      )}

      {ouvert && (
        <WorkflowFactureForm
          facture={facture}
          commande={commande}
          onChange={majWorkflow}
          onIdentification={(patch) => modifierFacture(projetId, commande.id, facture.id, patch)}
        />
      )}
    </div>
  )
}

function WorkflowFactureForm({
  facture,
  commande,
  onChange,
  onIdentification,
}: {
  facture: Facture
  commande: Commande
  onChange: (patch: Partial<WorkflowFacture>) => void
  onIdentification: (patch: Partial<Facture>) => void
}) {
  const w = facture.workflow ?? {}
  const delais = delaisFacture(facture)
  const affaires = projetsDeFacture(facture, commande)

  return (
    <div className="mt-2 mb-3 ml-5 rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
      {/* Identification : ces champs sont ceux du fichier de suivi Excel joint
          au document (SERVICE, MOIS, SITES, OBJET) et la date de réception,
          qui est la borne de départ des KPI. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <ChampDatePartielle
          label="Date de réception"
          value={facture.dateReception}
          onChange={(v) => onIdentification({ dateReception: v })}
        />
        <Input label="Service" value={facture.service ?? ''} onChange={(e) => onIdentification({ service: e.target.value })} placeholder="Métal (Atelier)" />
        <Input label="Site" value={facture.site ?? ''} onChange={(e) => onIdentification({ site: e.target.value })} placeholder="AGM" />
        <Input label="Mois" value={facture.mois ?? ''} onChange={(e) => onIdentification({ mois: e.target.value })} placeholder="mars-26" />
        <Input label="Objet" value={facture.objet ?? ''} onChange={(e) => onIdentification({ objet: e.target.value })} className="md:col-span-2" />
      </div>

      {/* Affaires payées par cette facture (rev01 §6 : « On doit pouvoir
          preciser le ou les projets pour lesquelles on va payer cette
          facture »). Bornées par celles de la commande, sans être refusées
          au-delà. */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">Affaires payées par cette facture</p>
        <SelecteurProjets
          projetIds={facture.projetIds ?? []}
          projetsLibres={facture.projetsLibres ?? []}
          onChange={(projetIds, projetsLibres) => onIdentification({ projetIds, projetsLibres })}
          restreintA={{ projetIds: projetsDeCommande(commande), projetsLibres: commande.projetsLibres ?? [] }}
          aide={
            affaires.heritee
              ? 'Rien de choisi : la facture suit les affaires de sa commande. En choisir ici ne change pas le montant imputé.'
              : 'Le montant HT n’est pas réparti entre ces affaires — la clé de répartition reste à définir.'
          }
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Workflow de validation</p>
        <ol className="space-y-2">
          <EtapeLigne numero={1} libelle="Validation par le métier technique" franchie={Boolean(w.dateValidationTechnique)}>
            <ChampDatePartielle
              label="Date de validation technique"
              value={w.dateValidationTechnique}
              onChange={(v) => onChange({ dateValidationTechnique: v })}
              className="w-52"
            />
          </EtapeLigne>

          <EtapeLigne numero={2} libelle="Transmission à la comptabilité client" franchie={Boolean(w.dateTransmissionCompta)}>
            <ChampDatePartielle
              label="Date de transmission"
              value={w.dateTransmissionCompta}
              onChange={(v) => onChange({ dateTransmissionCompta: v })}
              className="w-52"
            />
          </EtapeLigne>

          <EtapeLigne numero={3} libelle="Introduction dans SAP" franchie={w.introduiteSap === true}>
            <OuiNon label="Introduite dans SAP" valeur={w.introduiteSap} onChange={(v) => onChange({ introduiteSap: v })} />
            <ChampDatePartielle
              label="Date de chargement SAP"
              value={w.dateIntroductionSap}
              onChange={(v) => onChange({ dateIntroductionSap: v })}
              className="w-52"
              aide="Borne de départ du KPI principal."
            />
          </EtapeLigne>

          <EtapeLigne numero={4} libelle="Traitement CGE" franchie={w.traitementCge === true}>
            <OuiNon label="Traitement CGE" valeur={w.traitementCge} onChange={(v) => onChange({ traitementCge: v })} />
            <ChampDatePartielle
              label="Date de validation CGE"
              value={w.dateValidationCge}
              onChange={(v) => onChange({ dateValidationCge: v })}
              className="w-52"
            />
          </EtapeLigne>

          {/* L'étape que le rev01 §2 signale comme oubliée, à la place que le
              document lui donne : après CGE, avant le paiement. */}
          <EtapeLigne numero={5} libelle="Validation DO" franchie={w.validationDo === true}>
            <OuiNon label="Validation DO" valeur={w.validationDo} onChange={(v) => onChange({ validationDo: v })} />
            <DepartementDo valeur={w.departementValidationDo} onChange={(v) => onChange({ departementValidationDo: v })} />
            <ChampDatePartielle
              label="Date de validation DO"
              value={w.dateValidationDo}
              onChange={(v) => onChange({ dateValidationDo: v })}
              className="w-52"
            />
          </EtapeLigne>

          <EtapeLigne numero={6} libelle="Paiement en cours" franchie={w.paiementEnCours === true}>
            <OuiNon label="Paiement en cours" valeur={w.paiementEnCours} onChange={(v) => onChange({ paiementEnCours: v })} />
          </EtapeLigne>

          <EtapeLigne numero={7} libelle="Paiement réalisé" franchie={w.paiementRealise === true}>
            <OuiNon label="Paiement réalisé" valeur={w.paiementRealise} onChange={(v) => onChange({ paiementRealise: v })} />
            <ChampDatePartielle
              label="Date de paiement"
              value={w.datePaiement}
              onChange={(v) => onChange({ datePaiement: v })}
              className="w-52"
            />
          </EtapeLigne>
        </ol>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Commentaire</label>
        <input
          value={facture.commentaire ?? ''}
          onChange={(e) => onIdentification({ commentaire: e.target.value })}
          placeholder="Point bloquant, relance, anomalie…"
          className={selectClass}
        />
      </div>

      {/* KPI de traitement. Un délai dont une borne manque n'est pas affiché :
          un délai inconnu n'est pas un délai nul. Et quand la borne est connue
          au mois près, on dit que c'est la précision qui manque, pas la
          donnée — le rev01 autorise cette saisie sans dire sur quel jour du
          mois compter. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 border-t border-gray-200 pt-2">
        {CLES_DELAIS.map((cle) => (
          <Delai key={cle} libelle={LIBELLES_DELAIS[cle]} valeur={delais[cle]} raison={raisonDelaiAbsent(facture, cle)} principal={cle === 'sapAPaiement'} />
        ))}
      </div>
    </div>
  )
}

/**
 * Département responsable de la Validation DO (rev01 §2 : « DO ; CHEX ; ICP.
 * D'autres départements pourront être ajoutés ultérieurement via le menu
 * Paramètres »).
 *
 * Les trois valeurs du document, celles du référentiel et **celle déjà
 * enregistrée sur la facture** sont fusionnées : retirer un département du
 * référentiel ne doit pas effacer en silence la saisie des factures qui le
 * portent.
 */
function DepartementDo({ valeur, onChange }: { valeur?: string; onChange: (v: string) => void }) {
  const { valeursDe } = useListesValeurs()
  const options = avecAjouts(
    avecAjouts(DEPARTEMENTS_VALIDATION_DO, valeursDe('contrat.departementsValidationDo')),
    valeur ? [valeur] : []
  )
  return (
    <div className="w-40">
      <label className="block text-sm font-medium mb-1.5 text-gray-500">Département responsable</label>
      <select value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">—</option>
        {options.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  )
}

function EtapeLigne({
  numero,
  libelle,
  franchie,
  children,
}: {
  numero: number
  libelle: string
  franchie: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-end gap-3">
      <span
        className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold mb-2 ${
          franchie ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
        }`}
        aria-hidden
      >
        {franchie ? <Check className="w-3.5 h-3.5" /> : numero}
      </span>
      <span className="text-xs text-gray-600 mb-2.5 w-52">
        Étape {numero} — {libelle}
      </span>
      {children}
    </li>
  )
}

/**
 * Oui / Non du document, en **trois** états : non renseigné, Oui, Non.
 * Un booléen à deux états ferait passer « pas encore renseigné » pour « Non »,
 * alors que le fichier de suivi Excel distingue bien une case vide d'un
 * « NON » explicite.
 */
function OuiNon({ label, valeur, onChange }: { label: string; valeur?: boolean; onChange: (v: boolean | undefined) => void }) {
  return (
    <div className="w-32">
      <label className="block text-sm font-medium mb-1.5 text-gray-500">{label}</label>
      <select
        value={valeur === undefined ? '' : valeur ? 'oui' : 'non'}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'oui')}
        className={selectClass}
      >
        <option value="">—</option>
        <option value="oui">Oui</option>
        <option value="non">Non</option>
      </select>
    </div>
  )
}

function Delai({
  libelle,
  valeur,
  raison,
  principal,
}: {
  libelle: string
  valeur: number | null
  raison: ReturnType<typeof raisonDelaiAbsent>
  principal?: boolean
}) {
  return (
    <span className={principal ? 'text-gray-700' : undefined} title={raison ? LIBELLE_RAISON_ECART[raison] : undefined}>
      {principal && <span className="text-primary font-semibold">KPI · </span>}
      {libelle} :{' '}
      <span className="font-medium text-gray-800">
        {valeur === null ? (raison === 'precision' ? 'date au mois près' : '—') : `${valeur} j`}
      </span>
    </span>
  )
}
