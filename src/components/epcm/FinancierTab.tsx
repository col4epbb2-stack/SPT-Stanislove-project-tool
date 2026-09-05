import { useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { ChampMontant } from '../ui/ChampMontant'
import { SelecteurDevise } from '../ui/SelecteurDevise'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { TableauColonnes, type ColonneTableau } from '../ui/TableauColonnes'
import { formatNombre, formatPercent } from '../../lib/format'
import { nomComplet, type SyntheseEmployeEpcm, type SyntheseFinanciereEpcm } from '../../lib/contratEpcmEngine'
import { EnteteOnglet, JaugeBudget, MessageVide, StatCard } from './elements'
import type { ContratInput } from '../../lib/contratEpcmFirestore'
import type { ContratEpcmDoc } from '../../types/contratEpcm'
import { CLIENT_EPCM_PAR_DEFAUT } from '../../types/contratEpcm'
import type { ComparaisonMensuelle } from '../../lib/contratEpcmEngine'
import { SelectChamp } from '../ui/ChampsSaisie'
import { useMontant } from '../../lib/montantAffiche'
import type { CodeDevise } from '../../types/devise'

// Onglet « Suivi financier » (§8) : budget vendu vs coût réel, projection de
// fin de mois et écart. Rien n'est saisi ici en dehors du contrat lui-même —
// les coûts viennent des jours travaillés (planning et pointage) et des coûts
// journaliers de chaque employé.

function ContratForm({
  contratInitial,
  contratsPortfolio,
  onClose,
  onSubmit,
}: {
  contratInitial: ContratEpcmDoc | null
  /** Contrats du référentiel portfolio, pour le rattachement du préambule. */
  contratsPortfolio: { id: string; libelle: string }[]
  onClose: () => void
  onSubmit: (input: ContratInput) => Promise<void>
}) {
  const [valeurs, setValeurs] = useState<ContratInput>({
    reference: contratInitial?.reference ?? '',
    // Valeur par défaut du §6 (« valeur automatique : TotalEnergies EP
    // Gabon ») — proposée à la création, et modifiable : une valeur par
    // défaut n'est pas une valeur figée.
    client: contratInitial?.client ?? CLIENT_EPCM_PAR_DEFAUT,
    montantMensuelVenduParPersonne: contratInitial?.montantMensuelVenduParPersonne ?? null,
    budgetMensuel: contratInitial?.budgetMensuel ?? null,
    dateDebut: contratInitial?.dateDebut ?? null,
    dateFin: contratInitial?.dateFin ?? null,
    devise: contratInitial?.devise ?? 'XAF',
    contratPortfolioId: contratInitial?.contratPortfolioId ?? null,
    joursCommandes: contratInitial?.joursCommandes ?? null,
  })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const modifier = <K extends keyof ContratInput>(cle: K, valeur: ContratInput[K]) =>
    setValeurs((prev) => ({ ...prev, [cle]: valeur }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      await onSubmit(valeurs)
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Référence" value={valeurs.reference} onChange={(e) => modifier('reference', e.target.value)} required />
        <Input label="Client" value={valeurs.client ?? ''} onChange={(e) => modifier('client', e.target.value || null)} />
        {/* Les montants du contrat sont exprimés dans SA devise (champ
            ci-dessous) — la saisie, elle, accepte n'importe quelle devise
            convertible (18/08/2026, référentiel des devises). */}
        <ChampMontant
          label="Forfait mensuel vendu / personne (défaut)"
          devise={valeurs.devise}
          pas="0.01"
          value={valeurs.montantMensuelVenduParPersonne}
          onChange={(v) => modifier('montantMensuelVenduParPersonne', v)}
        />
        <ChampMontant
          label="Budget mensuel du contrat"
          devise={valeurs.devise}
          pas="0.01"
          value={valeurs.budgetMensuel}
          onChange={(v) => modifier('budgetMensuel', v)}
        />
        <Input label="Début" type="date" value={valeurs.dateDebut ?? ''} onChange={(e) => modifier('dateDebut', e.target.value || null)} />
        <Input label="Fin" type="date" value={valeurs.dateFin ?? ''} onChange={(e) => modifier('dateFin', e.target.value || null)} />
        <SelecteurDevise
          label="Devise du contrat"
          value={valeurs.devise}
          onChange={(code) => modifier('devise', code)}
        />
        {/* Rattachement au module Contrats (préambule du document : « le
            contrat EPCM existe déjà dans le module Contrats »). Une fois posé,
            valeur cible, AVC, commandes et factures ne se saisissent plus ici. */}
        <SelectChamp
          label="Contrat du module Contrats"
          value={valeurs.contratPortfolioId ?? ''}
          onChange={(v) => modifier('contratPortfolioId', v || null)}
          options={contratsPortfolio.map((c) => c.id)}
          libelles={Object.fromEntries(contratsPortfolio.map((c) => [c.id, c.libelle]))}
        />
        <Input
          label="Jours commandés au contrat"
          type="number"
          min="0"
          value={valeurs.joursCommandes ?? ''}
          onChange={(e) => modifier('joursCommandes', e.target.value === '' ? null : Number(e.target.value))}
        />
      </div>
      <p className="text-xs text-gray-500">
        Le forfait par personne n'est qu'une <strong>valeur par défaut</strong> : c'est le « Budget mensuel facturé au
        client » de chaque fiche employé qui fait foi, et le forfait du contrat ne s'applique qu'à une fiche qui n'en
        porte pas. Sans budget mensuel renseigné, le budget vendu est la somme de ces forfaits pour les employés
        actifs. Les jours commandés servent au KPI « taux de consommation des jours commandés » — sans eux, il n'est
        pas calculé.
      </p>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={envoi}>
          Enregistrer le contrat
        </Button>
      </div>
    </form>
  )
}

export function FinancierTab({
  deviseAffichage,
  contrat,
  contratsPortfolio,
  contratLie,
  comparaison,
  tauxJours,
  syntheses,
  finance,
  administrable,
  onEnregistrerContrat,
  onSupprimerContrat,
}: {
  /** Devise d'affichage du module (rev01, point 7) — `null` = celle du système. */
  deviseAffichage: CodeDevise | null
  contrat: ContratEpcmDoc | null
  contratsPortfolio: { id: string; libelle: string }[]
  /** Contrat du module Contrats rattaché, s'il y en a un. */
  contratLie: { libelle: string; valeurCible: number; consommation: number; nbAvc: number; devise: string } | null
  comparaison: ComparaisonMensuelle
  /** Jours consommés ÷ jours commandés — `null` sans jours commandés. */
  tauxJours: number | null
  syntheses: SyntheseEmployeEpcm[]
  finance: SyntheseFinanciereEpcm
  administrable: boolean
  onEnregistrerContrat: (input: ContratInput, initial: ContratEpcmDoc | null) => Promise<void>
  // Suppression définitive (04/09/2026) — la fonction existait côté engine
  // depuis le 26/08/2026 (`supprimerContrat`, `contratEpcmFirestore.ts`) sans
  // jamais être exposée à l'écran.
  onSupprimerContrat: (contrat: ContratEpcmDoc) => Promise<void>
}) {
  const [formOuvert, setFormOuvert] = useState(false)
  const [enSuppression, setEnSuppression] = useState(false)
  const devise = finance.devise
  // Le contrat EPCM porte sa propre devise (champ `devise` de l'onglet) : les
  // montants y sont enregistrés, et affichés dans celle du système comme
  // partout ailleurs (19/08/2026).
  const { montant: formatMontant, uniteAffichee, valeurAffichee: convertir } = useMontant(deviseAffichage)
  const montant = (v: number) => formatMontant(v, devise)
  const uniteMontants = uniteAffichee(devise)
  /** Valeur nue convertie, pour les cellules chiffrées et leurs extractions. */
  const valeurAffichee = (v: number | null) => convertir(v, devise)

  const colonnes: ColonneTableau<SyntheseEmployeEpcm>[] = [
    { cle: 'employe', entete: 'Employé', valeur: (s) => <span className="font-medium text-gray-900">{nomComplet(s.employe)}</span> },
    { cle: 'joursADate', entete: 'Jours à date', align: 'right', valeur: (s) => s.joursTravaillesADate },
    { cle: 'joursRestants', entete: 'Jours restants', align: 'right', valeur: (s) => s.joursTravaillesRestants },
    {
      // Ce que coûte une journée : le taux saisi, ou celui **déduit du salaire
      // mensuel** pour un salarié — qui n'en saisit plus depuis le rev01.
      // Lire `employe.coutJournalier` en direct afficherait « à définir » et un
      // coût nul pour tous les CDI.
      cle: 'coutJour',
      // Les colonnes chiffrées n'annonçaient aucune unité et n'étaient pas
      // converties, alors que les tuiles au-dessus l'étaient : deux devises
      // sur le même écran, dont une muette. Elles passent par `montant()`.
      entete: `Coût / jour (${uniteMontants})`,
      align: 'right',
      valeur: (s) =>
        s.tauxJournalier == null ? (
          <span className="text-orange-600">à définir</span>
        ) : (
          <span title={s.origineTauxJournalier === 'SALAIRE_MENSUEL' ? 'Déduit du salaire mensuel' : 'Taux journalier saisi'}>
            {formatNombre(valeurAffichee(s.tauxJournalier), 0)}
            {s.origineTauxJournalier === 'SALAIRE_MENSUEL' && <span className="text-gray-400 text-xs ml-1">déduit</span>}
          </span>
        ),
      texte: (s) => valeurAffichee(s.tauxJournalier),
    },
    { cle: 'coutReel', entete: `Coût engagé (${uniteMontants})`, align: 'right', valeur: (s) => formatNombre(valeurAffichee(s.coutReel), 0) },
    { cle: 'previsionnel', entete: `Prévisionnel fin de mois (${uniteMontants})`, align: 'right', valeur: (s) => formatNombre(valeurAffichee(s.coutPrevisionnelFinMois), 0) },
    { cle: 'vendu', entete: `Forfait vendu (${uniteMontants})`, align: 'right', valeur: (s) => formatNombre(valeurAffichee(s.venduMensuel), 0) },
    {
      cle: 'marge',
      entete: `Marge prévue (${uniteMontants})`,
      align: 'right',
      valeur: (s) => {
        const marge = valeurAffichee(s.venduMensuel - s.coutPrevisionnelFinMois)
        return <span className={(marge ?? 0) < 0 ? 'text-red-600 font-semibold' : 'text-gray-900'}>{formatNombre(marge, 0)}</span>
      },
    },
  ]

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre={contrat ? `Contrat ${contrat.reference}` : 'Contrat non défini'}
        aide={
          contrat
            ? `${contrat.client ?? 'Client non précisé'} · budget ${contrat.budgetMensuel != null ? montant(contrat.budgetMensuel) : 'non défini'} par mois`
            : "Aucun contrat enregistré : le budget vendu est calculé depuis les forfaits mensuels des employés actifs."
        }
      >
        {administrable && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFormOuvert(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              {contrat ? 'Modifier le contrat' : 'Définir le contrat'}
            </Button>
            {contrat && (
              <Button variant="ghost" size="sm" onClick={() => setEnSuppression(true)} className="text-red-600 hover:bg-red-50">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Supprimer
              </Button>
            )}
          </div>
        )}
      </EnteteOnglet>

      {enSuppression && contrat && (
        <ModaleSuppression
          titre={`Supprimer « ${contrat.reference} »`}
          message={
            <>
              Le contrat <span className="font-semibold">{contrat.reference}</span> sera supprimé définitivement.
            </>
          }
          avertissements={[
            contratLie &&
              "Un contrat du module Contrats reste rattaché : ce lien n'est porté que par ce document EPCM, il disparaît avec lui (le contrat du module Contrats, lui, n'est pas supprimé).",
            'Les employés, plannings et pointages déjà saisis ne sont pas supprimés — ils ne référencent pas ce contrat.',
          ].filter(Boolean)}
          libelleBouton="Supprimer le contrat"
          onFerme={() => setEnSuppression(false)}
          onConfirmer={async () => {
            await onSupprimerContrat(contrat)
            setEnSuppression(false)
          }}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Budget vendu"
          valeur={montant(finance.budgetVendu)}
          detail={finance.budgetDuContrat ? 'Budget du contrat' : 'Somme des forfaits actifs'}
        />
        <StatCard label="Coût engagé" valeur={montant(finance.coutEngage)} detail={`${finance.joursConsommes} jours consommés`} />
        <StatCard
          label="Coût restant"
          valeur={montant(finance.coutRestant)}
          ton={finance.coutRestant < 0 ? 'critique' : 'neutre'}
        />
        <StatCard label="% consommé" valeur={formatPercent(finance.pctConsomme, 0)} />
        <StatCard
          label="Prévisionnel fin de mois"
          valeur={montant(finance.coutPrevisionnelFinMois)}
          detail={`${finance.joursRestants} jours encore planifiés`}
        />
        <StatCard
          label="Écart au budget"
          valeur={montant(finance.ecart)}
          ton={finance.ecart < 0 ? 'critique' : 'positif'}
          detail={finance.ecart < 0 ? 'Dépassement attendu' : 'Marge attendue'}
        />
      </div>

      {/* Rattachement au module Contrats (préambule) : valeur cible, AVC,
          commandes et factures y vivent — affichées ici **en lecture**, pour
          qu'elles ne soient pas ressaisies et ne puissent pas diverger. */}
      {contratLie ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-medium text-primary">Contrat rattaché au module Contrats</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{contratLie.libelle}</p>
          <p className="text-xs text-gray-600 mt-1">
            Valeur cible {montant(contratLie.valeurCible)}
            {contratLie.nbAvc > 0 && <span className="text-gray-500"> (dont {contratLie.nbAvc} AVC)</span>} · consommé{' '}
            {montant(contratLie.consommation)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Valeur cible, augmentations, commandes et factures se gèrent dans le module Contrats : elles ne se
            saisissent pas ici.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Ce contrat EPCM n'est rattaché à aucun contrat du module Contrats. Sans rattachement, le montant facturé au
          client reste inconnu — à définir dans « Modifier le contrat ».
        </p>
      )}

      {/* La comparaison mensuelle du §7 — quatre montants, jamais fondus :
          les additionner ou déduire l'un des autres ferait disparaître
          l'écart qu'ils ont pour objet de montrer. */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Comparaison mensuelle</p>
          {/* KPI du document : jours consommés ÷ jours commandés. */}
          <p className="text-xs text-gray-500">
            Taux de consommation des jours commandés :{' '}
            <span className="font-semibold text-gray-900">{formatPercent(tauxJours, 0)}</span>
            {tauxJours === null && (
              <span className="text-amber-700"> — jours commandés non renseignés</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Coût du personnel pointé"
            valeur={montant(comparaison.coutPointe)}
            detail="Jours pointés × taux journalier"
          />
          <StatCard
            label="Coût réel payé"
            valeur={montant(comparaison.coutPaye)}
            detail={
              comparaison.sansRemuneration > 0
                ? `${comparaison.sansRemuneration} rémunération(s) non renseignée(s)`
                : 'Salaire mensuel, ou jours prestés'
            }
            ton={comparaison.sansRemuneration > 0 ? 'attention' : 'neutre'}
          />
          <StatCard
            label="Montant facturé au client"
            // `null` et non 0 : sans contrat rattaché, le montant facturé est
            // inconnu, pas nul.
            valeur={comparaison.montantFacture === null ? '—' : montant(comparaison.montantFacture)}
            detail={comparaison.montantFacture === null ? 'Contrat non rattaché' : 'Factures du module Contrats'}
          />
          <StatCard label="Budget client" valeur={montant(comparaison.budgetClient)} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Consommation du budget</span>
          <span className="font-semibold text-gray-900">{formatPercent(finance.pctConsomme, 0)}</span>
        </div>
        <JaugeBudget pct={finance.pctConsomme} />
      </div>

      {syntheses.length === 0 ? (
        <MessageVide>Aucun employé : rien à valoriser.</MessageVide>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <TableauColonnes
            colonnes={colonnes}
            lignes={syntheses.filter((s) => s.actif)}
            cleLigne={(s) => s.employe.id}
            exportation={{ nomFichier: 'epcm-financier', titre: 'EPCM — suivi financier' }}
          />
        </div>
      )}

      <Modal isOpen={formOuvert} onClose={() => setFormOuvert(false)} title="Contrat EPCM" maxWidth="max-w-2xl">
        <ContratForm
          contratInitial={contrat}
          contratsPortfolio={contratsPortfolio}
          onClose={() => setFormOuvert(false)}
          onSubmit={(input) => onEnregistrerContrat(input, contrat)}
        />
      </Modal>
    </div>
  )
}
