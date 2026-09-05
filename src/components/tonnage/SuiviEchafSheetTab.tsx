import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chargerSuiviEchafSheet } from '../../data/tonnageEchaf'
import type { SuiviEchafDetail, SuiviEchafSheet } from '../../types/tonnageEchaf'
import { formatDate, formatNombre, formatPercent } from '../../lib/format'
import { Chargement } from '../grilles/GrilleFeuilleTable'
import { useMontant } from '../../lib/montantAffiche'

// Reproduction fidèle de la feuille "SUIVI TONNAGE_ECHAF" du classeur
// « SUIVI TONNAGE ECHAFAUDAGES_26-06-2026.xlsm » : valeurs figées telles
// quelles (situation au 28/06/2026 — S27), aucune donnée recalculée depuis
// le Journal. Les colonnes Années/Trimestres/Mois (Date de dépose réelle)
// de la table des retards ne sont pas reprises : ce sont des champs de
// regroupement de TCD sans aucune valeur saisie dans le classeur.

// Palette validée (scripts/validate_palette.js du skill dataviz) — reprend
// les couleurs déjà utilisées par les autres onglets de la page.
const COLOR_CORE_CREW = '#4f46e5'
const COLOR_HORS_CORE_CREW = '#d97706'
const COLOR_CIBLE = '#10b981'
const COLOR_PROD = '#e11d48'

const axisDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function fmtDate(d: string | null): string {
  return d ? formatDate(d) : '—'
}

export function SuiviEchafSheetTab() {
  const [sheet, setSheet] = useState<SuiviEchafSheet | null>(null)

  useEffect(() => {
    let actif = true
    chargerSuiviEchafSheet().then((s) => actif && setSheet(s))
    return () => {
      actif = false
    }
  }, [])

  if (!sheet) return <Chargement />

  return (
    <div className="space-y-6">
      <EnTete sheet={sheet} />
      <ResumePoids sheet={sheet} />
      <ProductionParChamp sheet={sheet} />
      <PoidsJournalier sheet={sheet} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <ParSite sheet={sheet} />
        <ParDemande sheet={sheet} />
      </div>
      <RetardsEtPertes sheet={sheet} />
    </div>
  )
}

function EnTete({ sheet }: { sheet: SuiviEchafSheet }) {
  const { montant: formatMontant } = useMontant()
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-white rounded-2xl border border-gray-200 px-5 py-4">
      <div>
        <p className="text-xs text-gray-500">Situation au</p>
        <p className="font-semibold text-gray-900">
          {formatDate(sheet.meta.dateSituation)} — {sheet.meta.semaine}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Tarif contractuel</p>
        <p className="font-semibold text-gray-900">
          {formatMontant(sheet.meta.tarifXafTonneJour, 'XAF')} / tonne / jour
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Saving mutualisation total</p>
        <p className="font-semibold text-gray-900">
          {formatNombre(sheet.resume.savingMutualisationTotal, 2)} T
        </p>
      </div>
    </div>
  )
}

function ResumePoids({ sheet }: { sheet: SuiviEchafSheet }) {
  const totalMoyenne = sheet.resume.parChamp.reduce(
    (s, c) => s + c.moyenneCumulCoreCrew + c.moyenneCumulHorsCoreCrew,
    0
  )
  const { gmi } = sheet.resume

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Moyenne Poids contractuel</h3>
          <span className="text-lg font-bold text-gray-900">{formatNombre(totalMoyenne, 2)} T</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {sheet.resume.parChamp.map((c) => (
            <div key={c.champ} className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-900">{c.champ}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {formatPercent(c.pctMoyen)} prod. journalière
                </span>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Core Crew</dt>
                  <dd className="text-gray-900">{formatNombre(c.moyenneCumulCoreCrew, 2)} T</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Part Variable</dt>
                  <dd className="text-gray-900">{formatNombre(c.moyenneCumulHorsCoreCrew, 2)} T</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt className="text-gray-700">Total</dt>
                  <dd className="text-gray-900">
                    {formatNombre(c.moyenneCumulCoreCrew + c.moyenneCumulHorsCoreCrew, 2)} T
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Saving mutualisation</dt>
                  <dd className="text-gray-900">{formatNombre(c.savingMutualisation, 2)} T</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Moyenne Poids GMI</h3>
          <span className="text-lg font-bold text-gray-900">
            {formatNombre(gmi.coreCrew + gmi.partVariable, 2)} T
          </span>
        </div>
        <div className="px-5 py-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Core crew</dt>
              <dd className="text-gray-900">{formatNombre(gmi.coreCrew, 2)} T</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Part Variable</dt>
              <dd className="text-gray-900">{formatNombre(gmi.partVariable, 2)} T</dd>
            </div>
          </dl>
          <p className="text-xs text-gray-400 mt-3">Depuis le {formatDate(gmi.depuis)}</p>
        </div>
      </div>
    </div>
  )
}

function ProductionParChamp({ sheet }: { sheet: SuiviEchafSheet }) {
  const [champTable, setChampTable] = useState(sheet.production[0]?.champ ?? 'AGM')
  const production = sheet.production.find((p) => p.champ === champTable) ?? sheet.production[0]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {sheet.production.map((p) => (
          <div key={p.champ} className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-1">{p.champ}</h3>
            <p className="text-xs text-gray-400 mb-3">
              Tonnage cumulé facturé vs cible théorique (juin)
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={p.lignes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={axisDate}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={32} />
                <Tooltip
                  labelFormatter={(d) => axisDate(String(d))}
                  formatter={(v) => `${formatNombre(Number(v), 2)} T`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="cumulCoreCrew" name="Cumul Core crew" fill={COLOR_CORE_CREW} maxBarSize={12} radius={[3, 3, 0, 0]} />
                <Bar dataKey="cumulHorsCoreCrew" name="Cumul hors Core crew" fill={COLOR_HORS_CORE_CREW} maxBarSize={12} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="cibleTheorique" name="Cible théorique" stroke={COLOR_CIBLE} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="productionJournaliere" name="Prod. journalière" stroke={COLOR_PROD} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-900">Détail journalier par champ</h3>
          <div className="flex gap-1">
            {sheet.production.map((p) => (
              <button
                key={p.champ}
                onClick={() => setChampTable(p.champ)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  champTable === p.champ
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.champ}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-2 font-medium whitespace-nowrap">Date</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">
                  Tonnage cumulé facturé (Core crew)
                </th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">
                  Tonnage cumulé facturé (hors Core crew)
                </th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Seuil</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Saving mutualisation</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">
                  Cible théorique (forfait ajusté aux effectifs)
                </th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">
                  Production journalière à date
                </th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {production.lignes.map((l) => (
                <tr key={l.date}>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-900">{formatDate(l.date)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.cumulCoreCrew, 2)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.cumulHorsCoreCrew, 2)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.seuil, 2)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.savingMutualisation, 2)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.cibleTheorique, 2)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.productionJournaliere, 2)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatPercent(l.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PoidsJournalier({ sheet }: { sheet: SuiviEchafSheet }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Poids total journalier</h3>
        <p className="text-xs text-gray-400">
          Somme de poids contractuel monté par jour (juin) — ventilation Part Variable / Core crew
          reprise là où la feuille l'affiche
        </p>
      </div>
      <div className="p-5 pb-0">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={sheet.poidsJournalier}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={axisDate}
              minTickGap={20}
            />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={32} />
            <Tooltip
              labelFormatter={(d) => axisDate(String(d))}
              formatter={(v) => `${formatNombre(Number(v), 2)} T`}
            />
            <Bar dataKey="total" name="Poids total journalier (T)" fill={COLOR_CORE_CREW} maxBarSize={20} radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto border-t border-gray-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-2 font-medium whitespace-nowrap">Date</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Total (T)</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Part Variable (T)</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Core crew (T)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sheet.poidsJournalier.map((l) => (
              <tr key={l.date}>
                <td className="px-4 py-2 whitespace-nowrap text-gray-900">{formatDate(l.date)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.total, 2)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.partVariable, 2)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.coreCrew, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ParSite({ sheet }: { sheet: SuiviEchafSheet }) {
  const total = sheet.parSite.reduce((s, l) => s + l.poidsContractuel, 0)
  const data = useMemo(
    () => [...sheet.parSite].sort((a, b) => b.poidsContractuel - a.poidsContractuel),
    [sheet]
  )
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Poids contractuel par site</h3>
      </div>
      <div className="p-5 pb-0">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="site" tick={{ fontSize: 10, fill: '#6b7280' }} interval={0} angle={-35} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={38} />
            <Tooltip formatter={(v) => `${formatNombre(Number(v), 2)} T`} />
            <Bar dataKey="poidsContractuel" name="Poids contractuel (T)" fill={COLOR_CORE_CREW} maxBarSize={26} radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto border-t border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Site</th>
              <th className="px-4 py-2 font-medium text-right">Poids contractuel (T)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sheet.parSite.map((l) => (
              <tr key={l.site}>
                <td className="px-4 py-2 text-gray-900">{l.site}</td>
                <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.poidsContractuel, 2)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold text-gray-900">
              <td className="px-4 py-2">Total général</td>
              <td className="px-4 py-2 text-right">{formatNombre(total, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ParDemande({ sheet }: { sheet: SuiviEchafSheet }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Moyenne de poids par demande</h3>
        <p className="text-xs text-gray-400">TCD « N° DEMANDE × Moyenne de Poids (T) » — juin</p>
      </div>
      <div className="overflow-x-auto max-h-[26.5rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">N° demande</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Moyenne de poids (T)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sheet.parDemande.map((l) => (
              <tr key={l.demande}>
                <td className="px-4 py-2 text-gray-900">{l.demande}</td>
                <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.moyennePoids, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function cumulsParChamp(details: SuiviEchafDetail[], tarifXafTonneJour: number) {
  const champs = ['AGM', 'IM', 'TRM']
  return champs.map((champ) => {
    const lignes = details.filter((d) => d.champ === champ)
    const perte = lignes.reduce((s, d) => s + (d.perte ?? 0), 0)
    return {
      champ,
      retardJours: lignes.reduce((s, d) => s + (d.arbitrageRetard ?? 0), 0),
      perteXaf: perte,
      perteTonnes: perte / tarifXafTonneJour,
    }
  })
}

function RetardsEtPertes({ sheet }: { sheet: SuiviEchafSheet }) {
  const { montant: formatMontant, uniteAffichee } = useMontant()
  const cumuls = useMemo(() => cumulsParChamp(sheet.details, sheet.meta.tarifXafTonneJour), [sheet])
  const totalSavingDemontage = sheet.details.reduce((s, d) => s + (d.savingDemontageTonne ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Cumul retard et perte par champ</h3>
          <p className="text-xs text-gray-400">
            Échafaudages toujours montés au-delà de la date de dépose prévisionnelle — PERTE = retard
            × {formatMontant(sheet.meta.tarifXafTonneJour, 'XAF')}/T/jour × poids contractuel moyen
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Champ</th>
                <th className="px-5 py-3 font-medium text-right">Cumul retard (jours)</th>
                <th className="px-5 py-3 font-medium text-right">Cumul perte ({uniteAffichee('XAF')})</th>
                <th className="px-5 py-3 font-medium text-right">Cumul perte (tonnes-jours)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cumuls.map((c) => (
                <tr key={c.champ}>
                  <td className="px-5 py-3 font-medium text-gray-900">{c.champ}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(c.retardJours)}</td>
                  <td
                    className={`px-5 py-3 text-right font-medium ${c.perteXaf > 0 ? 'text-red-600' : 'text-gray-600'}`}
                  >
                    {formatMontant(c.perteXaf, 'XAF')}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(c.perteTonnes, 1)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-5 py-3">Total général</td>
                <td className="px-5 py-3 text-right">
                  {formatNombre(cumuls.reduce((s, c) => s + c.retardJours, 0))}
                </td>
                <td className="px-5 py-3 text-right">
                  {formatMontant(
                    cumuls.reduce((s, c) => s + c.perteXaf, 0),
                    'XAF'
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {formatNombre(
                    cumuls.reduce((s, c) => s + c.perteTonnes, 0),
                    1
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">
            Suivi des dépose — retards et pertes ({sheet.details.length} échafaudages)
          </h3>
          <p className="text-xs text-gray-400">
            Saving démontage cumulé : {formatNombre(totalSavingDemontage, 2)} T
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Champ</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Description des travaux</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Services</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Demandeur TEEPG</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">N° demande</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Montage réel</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Dépose prév.</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Notif. dépose</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Dépose réelle</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Commentaires</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Saving démontage (T)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Saving démontage (coût)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Poids contractuel moyen (T)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Retard prév. vs réelle (j)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Retard à date (j)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Retard notif (j)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Retard dépose (j)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Arbitrage retard (j)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Perte ({uniteAffichee('XAF')})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sheet.details.map((d, i) => (
                <tr key={`${d.numeroDemande ?? 'divers'}-${i}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{d.champ ?? '—'}</td>
                  <td className="px-3 py-2 max-w-72 truncate" title={d.description ?? undefined}>
                    {d.description ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.service ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.demandeur ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                    {d.numeroDemande ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.dateMontageReelle)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {d.dateDeposePrevManquante ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                        Indiquer date de dépose prévisionnelle
                      </span>
                    ) : (
                      fmtDate(d.dateDeposePrev)
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.dateNotificationDepose)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.dateDeposeReelle)}</td>
                  <td className="px-3 py-2 max-w-48 truncate" title={d.commentaires ?? undefined}>
                    {d.commentaires ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatNombre(d.savingDemontageTonne, 2)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatNombre(d.savingDemontageCout, 0)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatNombre(d.moyennePoidsContractuel, 3)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatNombre(d.moyenneRetardDeposePrevVsReelle)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right whitespace-nowrap ${(d.retardADate ?? 0) > 0 ? 'text-red-600 font-medium' : ''}`}
                  >
                    {formatNombre(d.retardADate)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatNombre(d.retardNotif)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatNombre(d.retardDepose)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatNombre(d.arbitrageRetard)}</td>
                  <td
                    className={`px-3 py-2 text-right whitespace-nowrap ${(d.perte ?? 0) > 0 ? 'text-red-600 font-medium' : ''}`}
                  >
                    {formatNombre(d.perte)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
