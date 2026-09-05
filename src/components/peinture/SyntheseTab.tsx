import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LigneJournalPeinture, PeintureDashboard } from '../../types/contratPeinture'
import {
  courbeStandByJournaliere,
  coutParCategorie,
  standByParTypeEtSite,
  syntheseParSite,
  totauxJournal,
} from '../../lib/contratPeintureEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { StatCard } from './elements'
import { COLOR_POINTAGE, COLOR_STANDBY } from './couleurs'
import { useMontant } from '../../lib/montantAffiche'

// Onglet "Synthèse facturation" — extrait de pages/ContratPeinturePage.tsx le
// 06/08/2026. Tous les pivots sont recalculés depuis le journal par
// lib/contratPeintureEngine.ts : ils suivent donc les saisies.

export function SyntheseTab({ journal, dashboard }: { journal: LigneJournalPeinture[]; dashboard: PeintureDashboard }) {
  const { montant: formatMontant } = useMontant()
  const parSite = useMemo(() => syntheseParSite(journal), [journal])
  const standBy = useMemo(() => standByParTypeEtSite(journal), [journal])
  const courbe = useMemo(() => courbeStandByJournaliere(journal), [journal])
  const parCategorie = useMemo(() => coutParCategorie(journal), [journal])
  const totaux = useMemo(() => totauxJournal(journal), [journal])

  const cibleTotale = dashboard.valeurCible.total ?? 0
  const depassement = totaux.coutTotalPointage - cibleTotale
  const standByParType = useMemo(() => {
    const acc = new Map<string, number>()
    for (const l of standBy) acc.set(l.typeItem, (acc.get(l.typeItem) ?? 0) + l.coutStandBy)
    return [...acc.entries()].map(([typeItem, cout]) => ({ typeItem, cout }))
  }, [standBy])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Coût total au pointage" value={formatMontant(totaux.coutTotalPointage, 'XAF')} />
        <StatCard label="Coût stand-by cumulé" value={formatMontant(totaux.coutStandBy, 'XAF')} />
        <StatCard label="Saving cumulé" value={formatMontant(totaux.saving, 'XAF')} negatif={totaux.saving < 0} />
        <StatCard label="Valeur cible (KOMODO)" value={formatMontant(cibleTotale, 'XAF')} />
        <StatCard label="Dépassement vs cible" value={formatMontant(depassement, 'XAF')} negatif={depassement > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Coût total au pointage par site</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={parSite} margin={{ top: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="site" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => formatNombre(v)} />
              <Tooltip formatter={(v) => formatNombre(Number(v))} />
              <Bar dataKey="coutTotalPointage" name="Coût au pointage" fill={COLOR_POINTAGE} radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="coutTotalPointage" position="top" formatter={(v: unknown) => formatMontant(Number(v), 'XAF')} style={{ fill: '#374151', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Suivi des coûts stand-by par jour (personnel)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={courbe}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => formatNombre(v)} />
              <Tooltip formatter={(v) => formatNombre(Number(v))} />
              <Line type="monotone" dataKey="cout" name="Coût stand-by" stroke={COLOR_STANDBY} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Coût stand-by par type d'item (STD)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={standByParType} layout="vertical" margin={{ left: 40, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => formatNombre(v)} />
              <YAxis dataKey="typeItem" type="category" width={140} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip formatter={(v) => formatNombre(Number(v))} />
              <Bar dataKey="cout" name="Coût stand-by" fill={COLOR_STANDBY} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="cout" position="right" formatter={(v: unknown) => formatMontant(Number(v), 'XAF')} style={{ fill: '#374151', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Coût total au pointage par catégorie</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={parCategorie} layout="vertical" margin={{ left: 30, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => formatNombre(v)} />
              <YAxis dataKey="categorie" type="category" width={110} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip formatter={(v) => formatNombre(Number(v))} />
              <Bar dataKey="cout" name="Coût au pointage" fill={COLOR_POINTAGE} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="cout" position="right" formatter={(v: unknown) => formatMontant(Number(v), 'XAF')} style={{ fill: '#374151', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Synthèse par site (feuille Synthèse_Facturation)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Site</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Qté</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Coût total au pointage</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Part</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Avant</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Après</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Valeur cible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parSite.map((s) => {
                const aa = dashboard.syntheseFacturationParSite.find((x) => x.site === s.site)
                const cible = dashboard.valeurCible.parSite.find((x) => x.site === s.site)
                return (
                  <tr key={s.site}>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.site}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.qte)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatMontant(s.coutTotalPointage, 'XAF')}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatPercent(s.part)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(aa?.avant ?? null)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(aa?.apres ?? null)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(cible?.cible ?? null)}</td>
                  </tr>
                )
              })}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-3 py-2">Total général</td>
                <td className="px-3 py-2 text-right">{formatNombre(parSite.reduce((s, x) => s + x.qte, 0))}</td>
                <td className="px-3 py-2 text-right">{formatMontant(parSite.reduce((s, x) => s + x.coutTotalPointage, 0), 'XAF')}</td>
                <td className="px-3 py-2 text-right">100%</td>
                <td className="px-3 py-2 text-right">
                  {formatNombre(dashboard.syntheseFacturationParSite.reduce((s, x) => s + (x.avant ?? 0), 0))}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatNombre(dashboard.syntheseFacturationParSite.reduce((s, x) => s + (x.apres ?? 0), 0))}
                </td>
                <td className="px-3 py-2 text-right">{formatNombre(dashboard.valeurCible.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">
          Avant / Après : montants de facturation par site avant et après révision. Réparation câble :{' '}
          {formatNombre(dashboard.valeurCible.reparationCable)}.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Stand-by par type d'item et par site</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Type d'item</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Site</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Qté (h)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Coût stand-by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {standBy.map((l) => (
                <tr key={`${l.typeItem}-${l.site}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{l.typeItem}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.site}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(l.qte)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatMontant(l.coutStandBy, 'XAF')}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-3 py-2">Total général</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right">{formatNombre(standBy.reduce((s, l) => s + l.qte, 0))}</td>
                <td className="px-3 py-2 text-right">{formatMontant(standBy.reduce((s, l) => s + l.coutStandBy, 0), 'XAF')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
