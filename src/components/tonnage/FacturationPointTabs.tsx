import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus } from 'lucide-react'
import type {
  LigneActiviteFacturation,
  ListesDataFacturation,
  SuiviFacturationGmi,
  SyntheseFacturation,
  Tableau12Row,
  TarifsFacturationPoint,
} from '../../types/facturationPoint'
import type { LigneJournalTonnage } from '../../types/tonnageEchaf'
import { ActiviteFacturationSaisieForm, type ActiviteFacturationSaisieInput } from './ActiviteFacturationSaisieForm'
import { colonnesActivites, colonnesFactures } from './colonnesFacturation'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { usePagination } from '../../lib/usePagination'
import {
  coutLocation,
  coutRegie,
  m3Activite,
  montantDepose,
  montantNdc,
  montantPose,
  numeroFacture,
} from '../../lib/facturationPointEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'

// Reproduction des feuilles du classeur « Facturation au point -
// Construction_Intégrité CRP-PJC-CTA22C03_Février 2024 » (contrat
// Échafaudage GMI CTA22C03), un composant par feuille. Le journal
// "SUIVI DES ACTIVITES" est entièrement recalculé par
// lib/facturationPointEngine.ts ; la feuille "SYNTHESE" (TCD + tableau
// mensuel) est figée telle quelle, son cache couvrant un historique plus
// large que les lignes encore présentes dans le journal.

const PAGE_SIZE = 20

function BadgeFeuilleMasquee() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      feuille masquée dans le classeur
    </span>
  )
}

// ---------------------------------------------------------------------------
// Feuille "SUIVI DES ACTIVITES"
// ---------------------------------------------------------------------------

export function FacturationActivitesTab({
  activites,
  tarifs,
  journal,
  onEnregistrer,
  onSupprimer,
}: {
  activites: LigneActiviteFacturation[]
  tarifs: TarifsFacturationPoint
  journal: LigneJournalTonnage[]
  onEnregistrer: (input: ActiviteFacturationSaisieInput) => Promise<void>
  onSupprimer: (ligne: LigneActiviteFacturation) => Promise<void>
}) {
  const m = useMontant()
  const { montant: formatMontant } = useMontant()
  const [filtreService, setFiltreService] = useState('')
  const [filtreSite, setFiltreSite] = useState('')
  const [filtreLieu, setFiltreLieu] = useState('')
  const [filtrePeriode, setFiltrePeriode] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneASupprimer, setLigneASupprimer] = useState<LigneActiviteFacturation | null>(null)

  const services = useMemo(
    () => [...new Set(activites.map((l) => l.service).filter((v): v is string => !!v))].sort(),
    [activites]
  )
  const sites = useMemo(
    () => [...new Set(activites.map((l) => l.site).filter((v): v is string => !!v))].sort(),
    [activites]
  )
  const periodes = useMemo(() => {
    const set = new Set(activites.map((l) => (l.mois ? l.mois.slice(0, 7) : null)).filter(Boolean) as string[])
    return [...set].sort()
  }, [activites])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return activites.filter(
      (l) =>
        (!filtreService || l.service === filtreService) &&
        (!filtreSite || l.site === filtreSite) &&
        (!filtreLieu || l.lieu === filtreLieu) &&
        (!filtrePeriode || (l.mois ?? '').startsWith(filtrePeriode)) &&
        (!q ||
          `${l.projet ?? ''} ${l.numeroDemande ?? ''} ${l.plateforme ?? ''} ${l.imputation ?? ''} ${l.commentaires ?? ''}`
            .toLowerCase()
            .includes(q))
    )
  }, [activites, filtreService, filtreSite, filtreLieu, filtrePeriode, recherche])

  // Équivalent des cellules SUBTOTAL en tête de la feuille : M3, montants
  // pose/dépose/NDC/location/régie et coût total des lignes filtrées.
  const totaux = useMemo(() => {
    let m3 = 0
    let pose = 0
    let depose = 0
    let ndc = 0
    let location = 0
    let regie = 0
    for (const l of filtered) {
      m3 += m3Activite(l)
      pose += montantPose(l, tarifs)
      depose += montantDepose(l, tarifs)
      ndc += montantNdc(l, tarifs)
      location += coutLocation(l, tarifs)
      regie += coutRegie(l, tarifs)
    }
    return { m3, pose, depose, ndc, location, regie, total: pose + depose + ndc + location + regie }
  }, [filtered, tarifs])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: 'M3', value: formatNombre(totaux.m3, 1) },
          { label: 'Facturation pose', value: formatMontant(Math.round(totaux.pose), 'XAF') },
          { label: 'Facturation dépose', value: formatMontant(Math.round(totaux.depose), 'XAF') },
          { label: 'Notes de calcul', value: formatMontant(Math.round(totaux.ndc), 'XAF') },
          { label: 'Location', value: formatMontant(Math.round(totaux.location), 'XAF') },
          { label: 'Régie', value: formatMontant(Math.round(totaux.regie), 'XAF') },
          { label: 'Coût total à facturer', value: formatMontant(Math.round(totaux.total), 'XAF') },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-sm font-bold text-gray-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          <Button type="button" size="sm" onClick={() => setFormOuvert(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Nouvelle ligne de facturation
          </Button>
          <FiltreSelect label="Mois" value={filtrePeriode} onChange={filtrer(setFiltrePeriode)} options={periodes} />
          <FiltreSelect label="Service" value={filtreService} onChange={filtrer(setFiltreService)} options={services} />
          <FiltreSelect label="Site" value={filtreSite} onChange={filtrer(setFiltreSite)} options={sites} />
          <FiltreSelect
            label="Lieu"
            value={filtreLieu}
            onChange={filtrer(setFiltreLieu)}
            options={['OFFSHORE', 'ONSHORE']}
          />
          <ChampRecherche
            value={recherche}
            onChange={filtrer(setRecherche)}
            placeholder="Projet, n° demande, plateforme, imputation..."
          />
          <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(activites.length)} />
        </BarreFiltresTableau>

        <TableauColonnes
          colonnes={colonnesActivites(tarifs, m, (l) => setLigneASupprimer(l))}
          lignes={visible}
          cleLigne={(l) => l.id}
          exportation={{ nomFichier: 'facturation-activites', titre: 'SUIVI DES ACTIVITES', lignes: filtered }}
        />

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <ActiviteFacturationSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={onEnregistrer}
        journal={journal}
        activitesExistantes={activites}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer la ligne de facturation « ${ligneASupprimer.numeroDemande ?? ligneASupprimer.id} »`}
          message="Cette saisie sera supprimée définitivement."
          avertissements={[
            'Si cette ligne provenait du classeur importé, elle réapparaîtra avec ses valeurs d\'origine — seule la saisie est retirée. Sinon, elle disparaît du tableau.',
          ]}
          libelleBouton="Supprimer"
          onFerme={() => setLigneASupprimer(null)}
          onConfirmer={async () => {
            await onSupprimer(ligneASupprimer)
            setLigneASupprimer(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feuille "SYNTHESE" (très masquée dans le classeur, valeurs figées)
// ---------------------------------------------------------------------------

// Séries du graphique de la feuille SYNTHESE (barres empilées par mois +
// ligne de valeur cible mensuelle). Palette du projet validée par
// scripts/validate_palette.js du skill dataviz (mode light, surface blanche).
const CHART_SERIES: { key: keyof Omit<Tableau12Row, 'mois'>; label: string; color: string }[] = [
  { key: 'coutMetalCorrige', label: 'Coût METAL corrigé', color: '#4f46e5' },
  { key: 'construction', label: 'CONSTRUCTION', color: '#d97706' },
  { key: 'exp', label: 'EXP', color: '#e11d48' },
  { key: 'opp', label: 'OPP', color: '#0891b2' },
  { key: 'speMai', label: 'SPE/MAI', color: '#eb6834' },
  { key: 'telecom', label: 'TELECOM', color: '#e87ba4' },
]
const COLOR_CIBLE = '#10b981'

const T12_COLONNES: { key: keyof Omit<Tableau12Row, 'mois'>; label: string }[] = [
  { key: 'metal', label: 'METAL' },
  { key: 'forfaitCoreCrew', label: 'Forfait Core crew' },
  { key: 'forfaitMateriel', label: 'Forfait matériel permanent' },
  { key: 'partieVariable', label: 'Partie variable Core crew' },
  { key: 'coutMetalCorrige', label: 'Coût METAL corrigé' },
  { key: 'construction', label: 'CONSTRUCTION' },
  { key: 'exp', label: 'EXP' },
  { key: 'opp', label: 'OPP' },
  { key: 'speMai', label: 'SPE/MAI' },
  { key: 'telecom', label: 'TELECOM' },
  { key: 'coutTotal', label: 'Coût total' },
  { key: 'valeurCibleMensuel', label: 'Valeur cible mensuelle' },
  { key: 'depassement', label: 'Dépassement' },
]

export function FacturationSyntheseTab({ synthese }: { synthese: SyntheseFacturation }) {
  const { montant: formatMontant } = useMontant()
  const nbMois = synthese.tableau12.filter((r) => r.partieVariable != null).length
  const forfaitTotal = synthese.forfaitMaterielM3Mensuel * nbMois
  const volumeTotal = synthese.sommeM3Pivot + forfaitTotal
  const depassement = synthese.realise - synthese.valeurCible

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500">
          Feuille "SYNTHESE" reprise telle quelle — TCD et tableau mensuel figés du classeur (situation février
          2024). Le cache du TCD couvre un historique plus large que les lignes encore présentes dans "SUIVI DES
          ACTIVITES" : il n'est pas recalculé.
        </p>
        <BadgeFeuilleMasquee />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Valeur cible', value: formatMontant(synthese.valeurCible, 'XAF'), negatif: false },
          { label: 'Réalisé', value: formatMontant(Math.round(synthese.realise), 'XAF'), negatif: false },
          { label: 'Dépassement', value: formatMontant(Math.round(depassement), 'XAF'), negatif: depassement > 0 },
          { label: 'Core crew', value: formatMontant(Math.round(synthese.coreCrewTotal), 'XAF'), negatif: false },
          { label: 'Total au point', value: formatMontant(Math.round(synthese.totalAuPoint), 'XAF'), negatif: false },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-2">{c.label}</p>
            <p className={`text-xl font-bold ${c.negatif ? 'text-red-600' : 'text-gray-900'}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Volume échafaudage</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-5 py-3 font-medium text-right">Volume échafaudage (m3)</th>
                <th className="px-5 py-3 font-medium text-right">Forfait matériel mensuel (m3)</th>
                <th className="px-5 py-3 font-medium text-right">Nombre de mois</th>
                <th className="px-5 py-3 font-medium text-right">Forfait total (m3)</th>
                <th className="px-5 py-3 font-medium text-right">Volume total (m3)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-5 py-3 text-right text-gray-600">{formatNombre(synthese.sommeM3Pivot, 1)}</td>
                <td className="px-5 py-3 text-right text-gray-600">{formatNombre(synthese.forfaitMaterielM3Mensuel)}</td>
                <td className="px-5 py-3 text-right text-gray-600">{formatNombre(nbMois)}</td>
                <td className="px-5 py-3 text-right text-gray-600">{formatNombre(forfaitTotal)}</td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatNombre(volumeTotal, 1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Coûts mensuels par service vs valeur cible</h3>
        <p className="text-xs text-gray-400 mb-4">
          Graphique de la feuille SYNTHESE : barres empilées (coût METAL corrigé + services) et valeur cible
          mensuelle ({formatMontant(Math.round(synthese.valeurCible / 12), 'XAF')}). Le tableau détaillé ci-dessous
          reprend les mêmes valeurs.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={synthese.tableau12}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v) => `${formatNombre(Number(v) / 1_000_000)} M`}
            />
            <Tooltip formatter={(v) => formatMontant(Math.round(Number(v)), 'XAF')} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {CHART_SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="couts"
                fill={s.color}
                stroke="#ffffff"
                strokeWidth={1}
                maxBarSize={30}
              />
            ))}
            <Line
              type="monotone"
              dataKey="valeurCibleMensuel"
              name="Valeur cible mensuelle"
              stroke={COLOR_CIBLE}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Coûts mensuels (Tableau12 du classeur)</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Forfait Core crew : {formatMontant(synthese.forfaitCoreCrewMensuel, 'XAF')} × {synthese.nbSitesCoreCrew}{' '}
            sites — Forfait matériel : {formatMontant(synthese.forfaitMaterielMensuel, 'XAF')} ×{' '}
            {synthese.nbSitesMateriel} sites — Valeur cible mensuelle = valeur cible annuelle / 12.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Mois</th>
                {T12_COLONNES.map((c) => (
                  <th key={c.key} className="px-3 py-2 font-medium text-right whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {synthese.tableau12.map((r) => (
                <tr key={r.mois}>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{r.mois}</td>
                  {T12_COLONNES.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 text-right whitespace-nowrap ${
                        c.key === 'depassement' && (r[c.key] ?? 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-600'
                      }`}
                    >
                      {formatNombre(r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-3 py-2">Total</td>
                {T12_COLONNES.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right whitespace-nowrap">
                    {formatNombre(synthese.tableau12Totaux[c.key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Coût total par période / imputation × service (TCD du classeur)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Périodes</th>
                {synthese.pivotServices.map((s) => (
                  <th key={s} className="px-3 py-2 font-medium text-right whitespace-nowrap">
                    {s}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Total général</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {synthese.pivotRows.map((r, i) => (
                <tr
                  key={`${r.label}-${i}`}
                  className={
                    r.niveau === 'total'
                      ? 'bg-gray-50 font-semibold text-gray-900'
                      : r.niveau === 'mois'
                        ? 'bg-gray-50/50 font-medium text-gray-900'
                        : ''
                  }
                >
                  <td className={`px-3 py-2 whitespace-nowrap ${r.niveau === 'imputation' ? 'pl-8 text-gray-600' : ''}`}>
                    {r.label}
                  </td>
                  {synthese.pivotServices.map((s) => (
                    <td key={s} className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                      {r.valeurs[s] != null ? formatNombre(r.valeurs[s]) : ''}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatNombre(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feuille "SUIVI DE FACTURATION" (très masquée dans le classeur)
// ---------------------------------------------------------------------------

export function FacturationSuiviTab({
  suiviFacturationGmi,
  synthese,
}: {
  suiviFacturationGmi: SuiviFacturationGmi
  synthese: SyntheseFacturation
}) {
  const { montant: formatMontant } = useMontant()
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreService, setFiltreService] = useState('')
  const [recherche, setRecherche] = useState('')

  const { factures, remise, ristourne } = suiviFacturationGmi

  const statuts = useMemo(
    () => [...new Set(factures.map((f) => f.statut).filter((v): v is string => !!v))].sort(),
    [factures]
  )
  const services = useMemo(
    () => [...new Set(factures.map((f) => f.service).filter((v): v is string => !!v))].sort(),
    [factures]
  )

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return factures.filter(
      (f) =>
        (!filtreStatut || f.statut === filtreStatut) &&
        (!filtreService || f.service === filtreService) &&
        (!q ||
          `${f.code} ${numeroFacture(f.code, f.mois)} ${f.projet ?? ''} ${f.bonCommande ?? ''} ${f.commentaire ?? ''}`
            .toLowerCase()
            .includes(q))
    )
  }, [factures, filtreStatut, filtreService, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const totalMontant = useMemo(() => filtered.reduce((s, f) => s + (f.montant ?? 0), 0), [filtered])
  const montantRemise = totalMontant * remise
  const montantRistourne = ristourne * synthese.realise

  // Équivalent du petit TCD "BC / TOTAL" en tête de la feuille : total facturé
  // par bon de commande, recalculé depuis les factures.
  const parBonCommande = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of factures) {
      const k = f.bonCommande ?? '(vide)'
      map.set(k, (map.get(k) ?? 0) + (f.montant ?? 0))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [factures])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500">
          Feuille "SUIVI DE FACTURATION" — factures GMI du contrat. N° de facture, année et totaux par bon de
          commande recalculés depuis la saisie.
        </p>
        <BadgeFeuilleMasquee />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Montant facturé (lignes filtrées)</p>
          <p className="text-xl font-bold text-gray-900">{formatMontant(totalMontant, 'XAF')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Remise ({formatPercent(remise, 0)})</p>
          <p className="text-xl font-bold text-gray-900">{formatMontant(montantRemise, 'XAF')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Net après remise</p>
          <p className="text-xl font-bold text-gray-900">{formatMontant(totalMontant - montantRemise, 'XAF')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Ristourne ({formatPercent(ristourne, 0)} du coût total SYNTHESE)</p>
          <p className="text-xl font-bold text-gray-900">{formatMontant(Math.round(montantRistourne), 'XAF')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Total par bon de commande</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-5 py-2 font-medium">BC</th>
                <th className="px-5 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parBonCommande.map(([bc, total]) => (
                <tr key={bc}>
                  <td className="px-5 py-2 text-gray-900">{bc}</td>
                  <td className="px-5 py-2 text-right text-gray-600">{formatNombre(total)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-5 py-2">Total général</td>
                <td className="px-5 py-2 text-right">
                  {formatNombre(parBonCommande.reduce((s, [, t]) => s + t, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <BarreFiltresTableau>
            <FiltreSelect label="Statut" value={filtreStatut} onChange={filtrer(setFiltreStatut)} options={statuts} />
            <FiltreSelect label="Service" value={filtreService} onChange={filtrer(setFiltreService)} options={services} />
            <ChampRecherche
              value={recherche}
              onChange={filtrer(setRecherche)}
              placeholder="N°, projet, BC, commentaire..."
            />
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {formatNombre(filtered.length)} / {formatNombre(factures.length)} factures
            </span>
          </BarreFiltresTableau>

          <TableauColonnes
            colonnes={colonnesFactures()}
            lignes={visible}
            cleLigne={(f) => f.id}
            messageVide="Aucune facture ne correspond aux filtres."
            exportation={{ nomFichier: 'facturation-factures-gmi', titre: 'Factures GMI', lignes: filtered }}
          />

          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feuille "TABLEAU_REGIE"
// ---------------------------------------------------------------------------

export function TableauRegieTab({ tarifs }: { tarifs: TarifsFacturationPoint }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Feuille "TABLEAU_REGIE" — grille tarifaire du contrat {tarifs.contrat} ({tarifs.fournisseur}). Le tarif par
        heure de régie est le tarif journalier divisé par 12, comme dans le classeur.
      </p>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium whitespace-nowrap">N°</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Rubrique</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Offshore — tarif</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Offshore — tarif/h</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Unité</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Onshore — tarif</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Onshore — tarif/h</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Unité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tarifs.lignes.map((l, i) => {
                const parHeure = (v: number | null, unite: string | null) =>
                  v != null && unite === 'CFA/jour' ? formatNombre(v / 12, 1) : '—'
                return (
                  <tr key={i}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{l.numero ?? ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{l.rubrique ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-pre-line">{l.description}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                      {formatNombre(l.offshoreTarif, 2)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                      {parHeure(l.offshoreTarif, l.offshoreUnite)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{l.offshoreUnite ?? ''}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                      {formatNombre(l.onshoreTarif, 2)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600">
                      {parHeure(l.onshoreTarif, l.onshoreUnite)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{l.onshoreUnite ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feuille "Facturation personnel et mat_ON" (barème à points, très masquée)
// ---------------------------------------------------------------------------

export function BaremeFacturationTab({ tarifs }: { tarifs: TarifsFacturationPoint }) {
  const { montant: formatMontant } = useMontant()
  const b = tarifs.bareme
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500 max-w-3xl">
          Feuille "Facturation personnel et mat_ON" — barème à points du contrat : une équation Pt = a·S + b par
          hauteur retraitée (S = surface), multipliée par la valeur du point et les coefficients. Les valeurs a/b
          affichées sont celles que le classeur lit réellement via MID(équation) — pour certaines hauteurs (ex. H =
          9), l'espace de tête de l'équation tronque la pente ; ce comportement est répliqué à l'identique.
        </p>
        <BadgeFeuilleMasquee />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Valeur du point offshore', value: formatMontant(b.tarifPointOffshore, 'XAF') },
          { label: 'Valeur du point onshore', value: formatMontant(b.tarifPointOnshore, 'XAF') },
          { label: 'Coeff. suspendu', value: formatNombre(b.coeffSuspendu, 2) },
          { label: 'Coeff. assistance respiratoire', value: formatNombre(b.coeffAssistance, 2) },
          { label: 'Coeff. offshore', value: formatNombre(b.coeffOffshore, 2) },
          {
            label: 'Taux pose / dépose',
            value: `${formatPercent(b.tauxPose, 0)} / ${formatPercent(b.tauxDepose, 0)}`,
          },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-sm font-bold text-gray-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden max-w-2xl">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Équations de points par hauteur retraitée</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-5 py-2 font-medium text-right">H</th>
              <th className="px-5 py-2 font-medium">Équation</th>
              <th className="px-5 py-2 font-medium text-right">a utilisé</th>
              <th className="px-5 py-2 font-medium text-right">b utilisé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {b.equations.map((e) => (
              <tr key={e.h}>
                <td className="px-5 py-2 text-right font-medium text-gray-900">{e.h}</td>
                <td className="px-5 py-2 text-gray-600">Pt = {e.equation}</td>
                <td className="px-5 py-2 text-right text-gray-600">{formatNombre(e.a, 4)}</td>
                <td className="px-5 py-2 text-right text-gray-600">{formatNombre(e.b, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feuille "DATA" (listes de référence)
// ---------------------------------------------------------------------------

export function DataFacturationTab({ listesDataFacturation }: { listesDataFacturation: ListesDataFacturation }) {
  const listes: { titre: string; valeurs: string[] }[] = [
    { titre: 'DIVISION', valeurs: listesDataFacturation.divisions },
    { titre: 'IMPUTATION', valeurs: listesDataFacturation.imputations },
    { titre: 'BON DE COMMANDE', valeurs: listesDataFacturation.bonsCommande },
    { titre: 'SITE', valeurs: listesDataFacturation.sites },
    { titre: 'SERVICES', valeurs: listesDataFacturation.services },
    { titre: 'PLATEFORMES', valeurs: listesDataFacturation.plateformes },
    { titre: 'PROJET', valeurs: listesDataFacturation.projets },
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Feuille "DATA" — listes de référence des menus déroulants de saisie du classeur, reprises telles quelles.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {listes.map((l) => (
          <div key={l.titre} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {l.titre} <span className="text-xs font-normal text-gray-400">({l.valeurs.length})</span>
              </h3>
            </div>
            <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {l.valeurs.map((v) => (
                <li key={v} className="px-5 py-2 text-sm text-gray-600">
                  {v}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
