import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, Pencil, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes, type ColonneTableau } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { usePagination } from '../../lib/usePagination'
import { aujourdHui, avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { CHAMPS } from '../../data/referentiels'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { formatDate, formatNombre } from '../../lib/format'
import {
  expirationVisiteMedicale,
  estActif,
  contratNonCommence,
  finContratEffective,
  habilitationsExpirees,
  moisCourant,
  nomComplet,
  tauxJournalierEffectif,
} from '../../lib/contratEpcmEngine'
import { TYPE_AFFECTATION_EMPLOYE_LABELS, TYPE_CONTRAT_EMPLOYE_LABELS } from '../../types/contratEpcm'
import type { PlanningMoisEpcm } from '../../types/contratEpcm'
import type { PropositionPlanning } from '../../lib/contratEpcmEngine'
import { GenerationPlanningModal } from './GenerationPlanningModal'
import { EmployeSaisieForm } from './EmployeSaisieForm'
import { EnteteOnglet, MessageVide } from './elements'
import { useMontant } from '../../lib/montantAffiche'
import type { CodeDevise } from '../../types/devise'
import type { EmployeInput } from '../../lib/contratEpcmFirestore'
import type { EmployeEpcm } from '../../types/contratEpcm'

// Onglet « Personnel » (§2) : l'annuaire du contrat. C'est le point d'entrée
// du module — sans employé, ni planning ni coût n'ont de sens, d'où le
// message d'amorçage quand la liste est vide.

const PAGE_SIZE = 15

/**
 * Nombre de jours avant une échéance à partir duquel elle est signalée
 * (§ « Vue Alertes » : « contrats expirant dans 30 jours »). Le regroupement
 * complet des alertes viendra avec son lot ; ici, la teinte suffit à faire
 * ressortir la ligne.
 */
const SEUIL_ECHEANCE_PROCHE = 30

export function PersonnelTab({
  deviseAffichage,
  employes,
  plannings,
  contrats,
  devise,
  modifiable,
  onEnregistrer,
  onGenererPlanning,
}: {
  /** Devise d'affichage du module (rev01, point 7) — `null` = celle du système. */
  deviseAffichage: CodeDevise | null
  employes: EmployeEpcm[]
  plannings: PlanningMoisEpcm[]
  contrats: string[]
  /** Devise d'**enregistrement** du contrat EPCM : celle dans laquelle la fiche se saisit. */
  devise: string
  modifiable: boolean
  onEnregistrer: (input: EmployeInput, initial: EmployeEpcm | null) => Promise<void>
  onGenererPlanning: (propositions: PropositionPlanning[]) => Promise<void>
}) {
  const [recherche, setRecherche] = useState('')
  const [filtreService, setFiltreService] = useState('')
  const [filtreSite, setFiltreSite] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [enEdition, setEnEdition] = useState<EmployeEpcm | null>(null)
  /** Employé dont on prépare la génération de planning (§3). */
  const [generation, setGeneration] = useState<EmployeEpcm | null>(null)

  const { valeursDe } = useListesValeurs()
  // Les colonnes de montants sont converties dans la devise d'affichage du
  // module ; leur en-tête porte cette devise, pas celle d'enregistrement.
  const { uniteAffichee, valeurAffichee } = useMontant(deviseAffichage)
  const uniteMontants = uniteAffichee(devise)
  const converti = (v: number | null) => valeurAffichee(v, devise)
  const services = useMemo(() => valeursDistinctes(employes, 'service'), [employes])
  const sites = useMemo(() => valeursDistinctes(employes, 'site'), [employes])
  const fonctions = useMemo(() => valeursDistinctes(employes, 'fonction'), [employes])
  const disciplines = useMemo(() => valeursDistinctes(employes, 'discipline'), [employes])
  // Binômes proposés : tout le monde sauf la personne en cours d'édition —
  // on ne peut pas être son propre binôme.
  const binomes = useMemo(
    () => employes.filter((e) => e.id !== enEdition?.id).map((e) => ({ id: e.id, nom: nomComplet(e) })),
    [employes, enEdition]
  )
  const responsables = useMemo(() => valeursDistinctes(employes, 'responsable'), [employes])

  const jour = aujourdHui()
  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return employes.filter(
      (e) =>
        (!filtreService || e.service === filtreService) &&
        (!filtreSite || e.site === filtreSite) &&
        // Le filtre porte sur l'activité **dérivée** (rev01) et non sur le
        // champ de la fiche, qui n'est plus qu'un forçage : filtrer sur
        // « Actifs » doit rendre ceux dont le contrat court.
        (!filtreStatut || (filtreStatut === 'ACTIF') === estActif(e, jour)) &&
        (!q ||
          nomComplet(e).toLowerCase().includes(q) ||
          (e.fonction ?? '').toLowerCase().includes(q) ||
          (e.responsable ?? '').toLowerCase().includes(q))
    )
  }, [employes, recherche, filtreService, filtreSite, filtreStatut, jour])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtres, PAGE_SIZE)

  const ouvrir = (employe: EmployeEpcm | null) => {
    setEnEdition(employe)
    setFormOuvert(true)
  }

  const colonnes: ColonneTableau<EmployeEpcm>[] = [
    ...(modifiable
      ? [
          {
            cle: 'edition',
            entete: '',
            valeur: (e: EmployeEpcm) => (
              <div className="flex items-center gap-1.5">
                <button onClick={() => ouvrir(e)} title="Modifier" className="text-gray-400 hover:text-primary transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {/* Génération du planning prévisionnel depuis la fiche (§3 et
                    §5 : « la logique doit être intégrée directement dans la
                    fiche du personnel »). Le bouton n'apparaît que si
                    l'affectation est renseignée — sans elle, il n'y a rien à
                    générer, et un bouton qui échoue toujours n'aide personne. */}
                {e.typeAffectation && e.dateDebutAffectation && e.dateFinAffectation && (
                  <button
                    onClick={() => setGeneration(e)}
                    title="Générer le planning prévisionnel"
                    className="text-gray-400 hover:text-primary transition-colors"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
    {
      cle: 'nom',
      entete: 'Employé',
      // Le statut affiché est le statut **dérivé** : « écarté » quand la fiche
      // le force, « contrat terminé » quand les dates le disent, « à venir »
      // quand il n'a pas commencé — ce dernier cas restant dans l'effectif,
      // c'est la période où l'on planifie la mobilisation.
      valeur: (e) => (
        <span className="font-medium text-gray-900">
          {nomComplet(e)}
          {e.statut === 'INACTIF' ? (
            <span className="ml-2 text-[11px] text-gray-400 font-normal">écarté</span>
          ) : !estActif(e, jour) ? (
            <span className="ml-2 text-[11px] text-gray-400 font-normal">contrat terminé</span>
          ) : contratNonCommence(e, jour) ? (
            <span className="ml-2 text-[11px] text-blue-500 font-normal">à venir</span>
          ) : null}
        </span>
      ),
    },
    { cle: 'fonction', entete: 'Fonction', valeur: (e) => e.fonction ?? '—' },
    { cle: 'discipline', entete: 'Discipline', valeur: (e) => e.discipline ?? '—' },
    { cle: 'service', entete: 'Service', valeur: (e) => e.service ?? '—' },
    {
      cle: 'typeContrat',
      entete: 'Contrat',
      valeur: (e) => (e.typeContrat ? TYPE_CONTRAT_EMPLOYE_LABELS[e.typeContrat] : '—'),
    },
    {
      cle: 'typeAffectation',
      entete: 'Affectation',
      valeur: (e) => (e.typeAffectation ? TYPE_AFFECTATION_EMPLOYE_LABELS[e.typeAffectation] : '—'),
    },
    { cle: 'site', entete: 'Site', valeur: (e) => e.site ?? '—' },
    {
      cle: 'binome',
      entete: 'Binôme',
      valeur: (e) => {
        const b = employes.find((x) => x.id === e.binomeId)
        // Un binôme dont la fiche a disparu garde son identifiant plutôt que
        // de s'effacer : le lien existe, c'est la fiche qui manque.
        return e.binomeId ? (b ? nomComplet(b) : e.binomeId) : '—'
      },
    },
    {
      cle: 'visiteMedicale',
      entete: 'Visite médicale',
      valeur: (e) => <EcheanceCellule date={expirationVisiteMedicale(e.dateVisiteMedicale)} />,
      texte: (e) => expirationVisiteMedicale(e.dateVisiteMedicale) ?? '',
    },
    {
      cle: 'habilitations',
      entete: 'Habilitations',
      valeur: (e) => {
        const total = (e.habilitations ?? []).length
        if (total === 0) return '—'
        const expirees = habilitationsExpirees(e.habilitations, aujourdHui()).length
        return expirees > 0 ? (
          <span className="text-red-700 font-medium">
            {total} · {expirees} expirée(s)
          </span>
        ) : (
          `${total}`
        )
      },
      texte: (e) => (e.habilitations ?? []).length,
    },
    {
      cle: 'contratTravail',
      entete: 'Fin de contrat',
      valeur: (e) => <EcheanceCellule date={finContratEffective(e)} />,
      texte: (e) => finContratEffective(e) ?? '',
    },
    { cle: 'responsable', entete: 'Responsable', valeur: (e) => e.responsable ?? '—' },
    {
      cle: 'coutJournalier',
      entete: `Coût / jour (${uniteMontants})`,
      align: 'right',
      // Un coût manquant n'est pas remplacé par une valeur par défaut : il
      // fausserait silencieusement tout le suivi financier, autant qu'il se
      // voie. Un salarié ne saisit plus de taux (rev01) : le sien est déduit
      // de son salaire mensuel, sur le mois en cours.
      valeur: (e) => {
        const taux = tauxJournalierEffectif(e, moisCourant())
        if (taux.valeur == null) {
          return (
            <span className="inline-flex items-center gap-1 text-orange-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />à définir
            </span>
          )
        }
        return (
          <span title={taux.origine === 'SALAIRE_MENSUEL' ? `Déduit du salaire mensuel ÷ ${taux.joursDuMois} jours` : 'Taux journalier saisi'}>
            {formatNombre(converti(taux.valeur), 0)}
            {taux.origine === 'SALAIRE_MENSUEL' && <span className="text-gray-400 text-xs ml-1">déduit</span>}
          </span>
        )
      },
      texte: (e) => converti(tauxJournalierEffectif(e, moisCourant()).valeur),
    },
    {
      cle: 'coutMensuelVendu',
      // « Budget mensuel facturé au client » (§6) — le document en fait un
      // champ obligatoire, et rappelle qu'il est **différent du coût salarial**.
      entete: `Budget client / mois (${uniteMontants})`,
      align: 'right',
      // Obligatoire dans le formulaire depuis le 26/08/2026, mais les fiches
      // déjà saisies n'en ont pas : on le signale au lieu de leur prêter une
      // valeur, comme pour le coût journalier.
      valeur: (e) =>
        e.coutMensuelVendu == null ? (
          <span className="inline-flex items-center gap-1 text-orange-600 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />à définir
          </span>
        ) : (
          formatNombre(converti(e.coutMensuelVendu), 0)
        ),
      texte: (e) => converti(e.coutMensuelVendu),
    },
    // Plus de colonne « Quota h » : le plafond d'heures a été retiré du
    // module (rev01, point 8 — « le suivi du nombre de jours est suffisant »).
    { cle: 'quotaJours', entete: 'Quota j', align: 'right', valeur: (e) => formatNombre(e.quotaJoursMois) },
  ]

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre={`Personnel (${employes.filter((e) => estActif(e, jour)).length} actifs / ${employes.length})`}
        aide="Chaque personne affectée au contrat, son cadre d'emploi, ses coûts et son plafond mensuel. L'activité n'est pas saisie : elle se déduit des dates du contrat de travail, sauf pour une personne explicitement écartée."
      >
        {modifiable && (
          <Button onClick={() => ouvrir(null)}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvel employé
          </Button>
        )}
      </EnteteOnglet>

      {employes.length === 0 ? (
        <MessageVide>
          Aucun employé enregistré. {modifiable ? 'Commencez par en créer un' : 'Un responsable doit en créer'} — le
          planning, les rotations et le suivi financier se construisent tous à partir de cette liste.
        </MessageVide>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <BarreFiltresTableau>
            <FiltreSelect label="Service" value={filtreService} onChange={(v) => { setFiltreService(v); resetPage() }} options={services} />
            <FiltreSelect label="Site" value={filtreSite} onChange={(v) => { setFiltreSite(v); resetPage() }} options={sites} />
            <FiltreSelect label="Statut" value={filtreStatut} onChange={(v) => { setFiltreStatut(v); resetPage() }} options={['ACTIF', 'INACTIF']} />
            <ChampRecherche value={recherche} onChange={(v) => { setRecherche(v); resetPage() }} placeholder="Nom, fonction, responsable…" />
            <CompteurLignes filtrees={formatNombre(filtres.length)} total={formatNombre(employes.length)} />
          </BarreFiltresTableau>

          <TableauColonnes
            colonnes={colonnes}
            lignes={visible}
            cleLigne={(e) => e.id}
            exportation={{ nomFichier: 'epcm-personnel', titre: 'EPCM — personnel', lignes: filtres }}
          />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} total={filtres.length} itemLabel="employés" />
        </div>
      )}

      {generation && (
        <GenerationPlanningModal
          employe={generation}
          employes={employes}
          plannings={plannings}
          onClose={() => setGeneration(null)}
          onAppliquer={onGenererPlanning}
        />
      )}

      <EmployeSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        employeInitial={enEdition}
        devise={devise}
        suggestions={{
          fonctions: avecAjouts(fonctions, valeursDe('epcm.fonctions')),
          disciplines: avecAjouts(disciplines, valeursDe('epcm.disciplines')),
          services: avecAjouts(services, valeursDe('epcm.services')),
          // Les trois sites du §5 (AGM, TRM, IM) sont ceux que l'application
          // connaît déjà (`CHAMPS`, référentiel commun) : les proposer n'est
          // pas inventer une donnée, c'est réutiliser la sienne. La liste
          // reste ouverte — un site inconnu se saisit quand même.
          sites: avecAjouts(avecAjouts(sites, CHAMPS), valeursDe('epcm.sites')),
          responsables: avecAjouts(responsables, valeursDe('epcm.responsables')),
          contrats,
          binomes,
        }}
        onSubmit={(input) => onEnregistrer(input, enEdition)}
      />
    </div>
  )
}

/**
 * Une échéance (visite médicale, fin de contrat) : la date, teintée selon
 * qu'elle est passée ou proche.
 *
 * **Trois états, pas deux** : une échéance absente n'est pas une échéance
 * dépassée — c'est une information manquante, et les deux appellent des
 * actions différentes (aller chercher la date, ou renouveler).
 */
function EcheanceCellule({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-300">—</span>
  const jours = Math.round((new Date(date).getTime() - new Date(aujourdHui()).getTime()) / 86_400_000)
  if (jours < 0) return <span className="text-red-700 font-medium">{formatDate(date)}</span>
  if (jours <= SEUIL_ECHEANCE_PROCHE) return <span className="text-amber-700 font-medium">{formatDate(date)}</span>
  return <span className="text-gray-600">{formatDate(date)}</span>
}
