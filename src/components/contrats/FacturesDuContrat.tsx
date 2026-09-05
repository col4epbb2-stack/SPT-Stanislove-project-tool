import { useMemo, useState } from 'react'
import { useProjects } from '../../contexts/useProjects'
import { useMontant } from '../../lib/montantAffiche'
import { usePagination } from '../../lib/usePagination'
import { Pagination } from '../ui/Pagination'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { TableauColonnes } from '../ui/TableauColonnes'
import { UNITE_XAF } from '../../lib/unitesMontant'
import { projetsDeFacture, toutesCommandesContrat } from '../../types/project'
import { valeursDistinctes } from '../../lib/saisie'
import {
  ETAPES_FACTURE,
  LIBELLES_DELAIS,
  etapeCourante,
  moyennesDelais,
  resumeFactures,
  statutFacture,
} from '../../lib/facturesContratEngine'
import { colonnesFactures, type LigneFacture } from './colonnesFactures'

/**
 * Tableau de suivi des factures d'un contrat (`doc/module contrat.docx` §6).
 *
 * « Lorsqu'une facture est créée puis imputée à une commande : les informations
 * déjà saisies lors de la création doivent être reprises **automatiquement** ;
 * seules les informations relatives au workflow de validation et de paiement
 * doivent être complétées manuellement. »
 *
 * C'est exactement ce que fait cet écran : il **ne saisit rien**. Il rassemble
 * les factures de toutes les commandes du contrat — celles rattachées à une
 * fiche projet comme celles suivies directement (§3) — et les montre avec leur
 * statut calculé et leur avancement dans le workflow. La saisie reste là où
 * elle a lieu : dans la ligne de la facture, sous sa commande.
 *
 * Les colonnes sont celles du fichier de suivi Excel joint au document,
 * complétées des dates du §5 (cf. `colonnesFactures`), et l'extraction
 * CSV / PDF / XLSX en découle sans travail supplémentaire.
 */
export function FacturesDuContrat({ contratId }: { contratId: string }) {
  const { projects, commandes } = useProjects()
  const format = useMontant()
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut] = useState('')
  const [etape, setEtape] = useState('')
  const [service, setService] = useState('')
  const [departement, setDepartement] = useState('')

  const lignes = useMemo<LigneFacture[]>(() => {
    const nomProjet = (id: string) => projects.find((p) => p.id === id)?.nom ?? id
    return toutesCommandesContrat(projects, commandes, contratId).flatMap((commande) =>
      (commande.factures ?? []).map((facture) => {
        // Les affaires de la facture (rev01 §6), à défaut celles de sa
        // commande — c'est la lecture de `projetsDeFacture`, pas une seconde
        // règle écrite ici.
        const affaires = projetsDeFacture(facture, commande)
        return {
          facture,
          commande,
          affaires: [...affaires.projetIds.map(nomProjet), ...affaires.projetsLibres],
          affairesHeritees: affaires.heritee,
        }
      })
    )
  }, [projects, commandes, contratId])

  const services = useMemo(
    () => valeursDistinctes(lignes.map((l) => ({ service: l.facture.service ?? '' })), 'service'),
    [lignes]
  )
  // Départements **réellement portés** par les factures du contrat : proposer
  // une valeur du référentiel qui ne ramènerait aucune ligne n'aiderait
  // personne (règle des barres de filtres, 18/08/2026).
  const departements = useMemo(
    () =>
      valeursDistinctes(
        lignes.map((l) => ({ dep: l.facture.workflow?.departementValidationDo ?? '' })),
        'dep'
      ),
    [lignes]
  )

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return lignes.filter((l) => {
      if (statut && statutFacture(l.facture) !== statut) return false
      if (etape && String(etapeCourante(l.facture)) !== etape) return false
      if (service && (l.facture.service ?? '') !== service) return false
      if (departement && (l.facture.workflow?.departementValidationDo ?? '') !== departement) return false
      if (!terme) return true
      return [l.facture.numero, l.commande.numero, l.facture.objet, l.facture.commentaire, ...l.affaires]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(terme))
    })
  }, [lignes, recherche, statut, etape, service, departement])

  const pagination = usePagination(filtrees, 15)
  const resume = resumeFactures(filtrees.map((l) => l.facture))
  const delais = moyennesDelais(filtrees.map((l) => l.facture))
  const colonnes = useMemo(() => colonnesFactures(format, UNITE_XAF.devise), [format])

  if (lignes.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-gray-100 p-3">
        <p className="text-xs font-medium text-gray-500 mb-1">Suivi des factures</p>
        <p className="text-xs text-gray-400">
          Aucune facture sur ce contrat. Les factures s'ajoutent sous leur commande, ci-dessus, et remontent ici
          automatiquement.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-100 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-gray-500">Suivi des factures</p>
        <CompteurLignes filtrees={String(filtrees.length)} total={String(lignes.length)} suffixe="facture(s)" />
      </div>

      {/* Compteurs et KPI de traitement (§5) — ils suivent les filtres, comme
          le tableau qu'ils résument : les contredire serait pire que de ne
          rien afficher. */}
      <div className="mb-3 rounded-xl bg-gray-50/70 px-3 py-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-gray-500">Total : {format.montant(resume.total, UNITE_XAF.devise)}</span>
        <span className="text-green-700">
          Payé : {format.montant(resume.paye, UNITE_XAF.devise)} ({resume.nombrePayees})
        </span>
        <span className="text-amber-700">
          Impayé : {format.montant(resume.impaye, UNITE_XAF.devise)} ({resume.nombreImpayees})
        </span>
        {/* Chaque moyenne porte son effectif : calculée sur 2 factures parmi
            40, elle ne mesure pas le contrat. */}
        {/* Le KPI que le rev01 §3 désigne comme **principal** vient en tête,
            et s'affiche même à vide : c'est celui qu'on vient chercher, et
            son absence est une information (aucune facture n'a encore ses
            deux dates au jour près). */}
        <span className={delais.sapAPaiement.valeur !== null ? 'text-gray-700' : 'text-gray-400'}>
          <span className="text-primary font-semibold">KPI · </span>
          {LIBELLES_DELAIS.sapAPaiement} :{' '}
          <span className="font-medium text-gray-800">
            {delais.sapAPaiement.valeur !== null ? `${delais.sapAPaiement.valeur} j` : '—'}
          </span>{' '}
          (sur {delais.sapAPaiement.nombre})
        </span>
        {delais.receptionAPaiement.valeur !== null && (
          <span className="text-gray-500">
            {LIBELLES_DELAIS.receptionAPaiement} :{' '}
            <span className="font-medium text-gray-800">{delais.receptionAPaiement.valeur} j</span> (sur{' '}
            {delais.receptionAPaiement.nombre})
          </span>
        )}
        {delais.validationACompta.valeur !== null && (
          <span className="text-gray-500">
            {LIBELLES_DELAIS.validationACompta} :{' '}
            <span className="font-medium text-gray-800">{delais.validationACompta.valeur} j</span> (sur{' '}
            {delais.validationACompta.nombre})
          </span>
        )}
      </div>

      <BarreFiltresTableau>
        <FiltreSelect label="Statut" value={statut} onChange={setStatut} options={['PAYEE', 'IMPAYEE']} />
        <FiltreSelect
          label="Étape atteinte"
          value={etape}
          onChange={setEtape}
          options={['0', ...ETAPES_FACTURE.map((e) => String(e.numero))]}
          libelleTous="Toutes"
        />
        {services.length > 0 && <FiltreSelect label="Service" value={service} onChange={setService} options={services} />}
        {departements.length > 0 && (
          <FiltreSelect label="Département DO" value={departement} onChange={setDepartement} options={departements} />
        )}
        <ChampRecherche value={recherche} onChange={setRecherche} placeholder="N° facture, commande, objet…" />
      </BarreFiltresTableau>

      <TableauColonnes
        colonnes={colonnes}
        lignes={pagination.visible}
        cleLigne={(l) => l.facture.id}
        messageVide="Aucune facture ne correspond aux filtres."
        exportation={{
          nomFichier: 'factures-contrat',
          titre: 'Suivi des factures du contrat',
          // Le tableau est paginé : on extrait l'ensemble **filtré**, pas la
          // page affichée — sinon on sortirait 15 lignes sur 60 sans le dire.
          lignes: filtrees,
        }}
      />
      {pagination.pageCount > 1 && (
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          onPageChange={pagination.setPage}
          total={filtrees.length}
          itemLabel="factures"
        />
      )}

      {/* L'écran dit ce qu'il ne couvre pas : le fichier Excel porte une
          colonne « EN COURS DE TRAITEMENT » qui ne correspond à aucune des six
          étapes du texte. Aucune septième étape n'a été inventée. */}
      <p className="mt-2 text-xs text-gray-400">
        La saisie se fait sous chaque commande : cet écran ne fait que rassembler les factures du contrat. La colonne
        « En cours de traitement » du fichier Excel n'est pas reprise — elle ne correspond à aucune des sept étapes
        décrites, Validation DO comprise.
      </p>
    </div>
  )
}
