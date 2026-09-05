import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProcurementCharts, TransitProcurement } from '../../types/procurementFollowUp'
import { histoMoisVersHisto } from '../../lib/procurementFollowUpEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { COULEUR_PRINCIPALE, HistoDureeChart, StatCard } from './elements'

// Onglet "Transit" — extrait de pages/ProcurementFollowUpPage.tsx le
// 06/08/2026. Uniquement des agrégats du classeur (livraison par scope,
// transit aérien, listes de PO) : pas de saisie ligne à ligne ici,
// contrairement aux 5 journaux.

export function TransitTab({ transit, charts }: { transit: TransitProcurement; charts: ProcurementCharts }) {
  const chartData = useMemo(
    () =>
      transit.livraisonParScope
        .filter((l) => l.totalArticles > 0)
        .map((l) => ({ scope: (l.scope ?? '—').slice(0, 28), pct: l.pctLivraison }))
        .sort((a, b) => b.pct - a.pct),
    [transit.livraisonParScope]
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Transit aérien — articles"
          value={formatNombre(transit.resumeAerien.quantite)}
          detail={`${formatNombre(transit.resumeAerien.livres)} livrés magasin (${formatPercent(transit.resumeAerien.pct)})`}
        />
        <StatCard label="PO avec réception ETA POG" value={formatNombre(transit.posReceptionEtaPog.length)} />
        <StatCard label="PO check transit LBV OK" value={formatNombre(transit.posCheckLbv.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HistoDureeChart
          titre="ETA transit LBV (aérien, check OK) — durée par PO"
          data={histoMoisVersHisto(charts.transit.histoEtaLbvAerien)}
          limite={charts.transit.limiteJours}
          hauteur={220}
        />
        <HistoDureeChart
          titre="ETA transit POG (aérien, réception OUI) — durée par PO"
          data={histoMoisVersHisto(charts.transit.histoEtaPogAerien)}
          limite={charts.transit.limiteJours}
          hauteur={220}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">% de livraison magasin par scope</h3>
        <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 22)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 1]}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
            />
            <YAxis dataKey="scope" type="category" width={190} tick={{ fontSize: 10, fill: '#6b7280' }} />
            <Tooltip formatter={(v) => formatPercent(Number(v))} />
            <Bar dataKey="pct" name="% livraison magasin" fill={COULEUR_PRINCIPALE} radius={[0, 3, 3, 0]} maxBarSize={14}>
              <LabelList
                dataKey="pct"
                position="right"
                formatter={(v: unknown) => `${Math.round(Number(v) * 100)}%`}
                style={{ fill: '#374151', fontSize: 10 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Livraison par scope ({transit.livraisonParScope.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">N° PO ou DA</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Quantité</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Lieu de livraison</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Total articles scope</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Livrés</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">% livraison magasin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transit.livraisonParScope.map((l, i) => (
                <tr key={`${l.numeroPo}-${i}`}>
                  <td className="px-3 py-2 text-gray-900 max-w-80 truncate" title={l.scope ?? undefined}>
                    {l.scope ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.numeroPo ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(l.quantite)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.lieuLivraison ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(l.totalArticles)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(l.livres)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatPercent(l.pctLivraison)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">
              Livraison magasin par PO ({transit.livraisonMagasinParPo.length})
            </h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {transit.livraisonMagasinParPo.map((l, i) => (
                <tr key={`${l.numeroPo}-${i}`}>
                  <td className="px-4 py-2 text-gray-900 max-w-64 truncate" title={l.scope ?? undefined}>
                    {l.scope ?? '—'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">{l.numeroPo ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.quantite)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Transit aérien par scope ({transit.aerienParScope.length})</h3>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {transit.aerienParScope.map((l, i) => (
                  <tr key={`${l.scope}-${i}`}>
                    <td className="px-4 py-2 text-gray-900 max-w-72 truncate" title={l.scope ?? undefined}>
                      {l.scope ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.quantite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">PO — réception ETA POG (aérien)</h3>
            <div className="flex flex-wrap gap-1.5">
              {transit.posReceptionEtaPog.map((p) => (
                <span key={p} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700">
                  {p}
                </span>
              ))}
            </div>
            <h3 className="font-semibold text-gray-900 mt-4 mb-3">PO — check transit LBV OK</h3>
            <div className="flex flex-wrap gap-1.5">
              {transit.posCheckLbv.map((p) => (
                <span key={p} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
