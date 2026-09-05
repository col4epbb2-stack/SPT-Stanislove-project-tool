import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AffaireMetal, MetalKpiDashboard, MetalReferentiel } from '../../types/travauxMetal'
import {
  avancementParChampTypeAvis,
  comptageParPeriode,
  jaugesAvancement,
  repartitionPar,
  tauxTraitement,
} from '../../lib/travauxMetalEngine'
import { formatNombre, formatPercent } from '../../lib/format'

// Onglet "KPI METAL" — extrait de pages/TravauxMetalPage.tsx le 06/08/2026
// (voir AffairesTab.tsx). Contenu inchangé : tous les pivots dérivables sont
// recalculés depuis la table des affaires par lib/travauxMetalEngine.ts ;
// seules les zones non dérivables (backlog 2025, courbe mensuelle 2026,
// budgets par champ) viennent figées du classeur.

const COLOR_PREV = '#4f46e5'
const COLOR_REEL = '#d97706'
const COLOR_BACKLOG = '#10b981'

function StatCard({ label, value, negatif = false, detail }: { label: string; value: string; negatif?: boolean; detail?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${negatif ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  )
}

export function KpiTab({
  kpi,
  affaires,
  referentiel,
}: {
  kpi: MetalKpiDashboard
  affaires: AffaireMetal[]
  referentiel: MetalReferentiel
}) {
  const jauges = useMemo(() => jaugesAvancement(affaires), [affaires])
  const taux = useMemo(() => tauxTraitement(affaires), [affaires])
  const parChampAvis = useMemo(() => avancementParChampTypeAvis(affaires), [affaires])
  const parTypeTravaux = useMemo(() => repartitionPar(affaires, (a) => a.typeTravaux), [affaires])
  const parStatut = useMemo(() => repartitionPar(affaires, (a) => a.statutTravaux), [affaires])
  const parPlateforme = useMemo(() => repartitionPar(affaires, (a) => a.plateforme), [affaires])
  const demandesParPeriode = useMemo(() => comptageParPeriode(affaires, (a) => a.dateDemande), [affaires])

  const champChart = useMemo(() => {
    const acc = new Map<string, { champ: string; prev: number[]; reel: number[] }>()
    for (const l of parChampAvis) {
      const e = acc.get(l.champ) ?? { champ: l.champ, prev: [], reel: [] }
      if (l.moyennePrev != null) e.prev.push(l.moyennePrev)
      if (l.moyenneReel != null) e.reel.push(l.moyenneReel)
      acc.set(l.champ, e)
    }
    return [...acc.values()].map((e) => ({
      champ: e.champ,
      prev: e.prev.length ? e.prev.reduce((s, v) => s + v, 0) / e.prev.length : 0,
      reel: e.reel.length ? e.reel.reduce((s, v) => s + v, 0) / e.reel.length : 0,
    }))
  }, [parChampAvis])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Avancement général prévisionnel" value={formatPercent(jauges.prev)} />
        <StatCard label="Avancement général réel" value={formatPercent(jauges.reel)} />
        <StatCard
          label="Écart réel vs prévisionnel"
          value={formatPercent(jauges.ecart)}
          negatif={(jauges.ecart ?? 0) < 0}
        />
        <StatCard
          label="Taux de traitement à date"
          value={`${formatNombre(taux.terminees)} / ${formatNombre(taux.total)}`}
          detail={`terminées — dont ${formatNombre(taux.soldees)} soldées (DFA-CFP-CFT signé)`}
        />
        <StatCard
          label="Backlog 2025 (figé au classeur)"
          value={formatNombre(kpi.backlog2025.backlog)}
          detail={`${formatNombre(kpi.backlog2025.totalAffaires)} affaires · ${formatNombre(kpi.backlog2025.terminees)} terminées · ${formatNombre(kpi.backlog2025.soldees)} soldées`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Avancement général par champ — prévisionnel vs réel</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={champChart} margin={{ top: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="champ" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                domain={[0, 1]}
              />
              <Tooltip formatter={(v) => formatPercent(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="prev" name="Prévisionnel" fill={COLOR_PREV} radius={[4, 4, 0, 0]} maxBarSize={36}>
                <LabelList dataKey="prev" position="top" formatter={(v: unknown) => `${Math.round(Number(v) * 100)}%`} style={{ fill: '#374151', fontSize: 11 }} />
              </Bar>
              <Bar dataKey="reel" name="Réel" fill={COLOR_REEL} radius={[4, 4, 0, 0]} maxBarSize={36}>
                <LabelList dataKey="reel" position="top" formatter={(v: unknown) => `${Math.round(Number(v) * 100)}%`} style={{ fill: '#374151', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Nouvelles demandes par période</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={demandesParPeriode}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="periode" tick={{ fontSize: 10, fill: '#6b7280' }} minTickGap={12} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip formatter={(v) => formatNombre(Number(v))} />
              <Bar dataKey="nombre" name="Nombre de demandes" fill={COLOR_PREV} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Avancement par champ et type d'avis</h3>
          <p className="text-xs text-gray-400">
            Satisfaction : 🙂 si l'avancement réel suit le prévisionnel (écart ≥ −10 points), 🙁 sinon
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Champ</th>
                <th className="px-4 py-2 font-medium">Type d'avis</th>
                <th className="px-4 py-2 font-medium text-right">Nombre d'avis</th>
                <th className="px-4 py-2 font-medium text-right">Prévisionnel</th>
                <th className="px-4 py-2 font-medium text-right">Réel</th>
                <th className="px-4 py-2 font-medium text-right">Écart</th>
                <th className="px-4 py-2 font-medium text-center">Satisfaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parChampAvis.map((l) => (
                <tr key={`${l.champ}-${l.typeAvis}`}>
                  <td className="px-4 py-2 font-medium text-gray-900">{l.champ}</td>
                  <td className="px-4 py-2">{l.typeAvis}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.nombre)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatPercent(l.moyennePrev)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatPercent(l.moyenneReel)}</td>
                  <td className={`px-4 py-2 text-right ${(l.ecart ?? 0) < 0 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                    {formatPercent(l.ecart)}
                  </td>
                  <td className="px-4 py-2 text-center">{(l.ecart ?? 0) >= -0.1 ? '🙂' : '🙁'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Courbe mensuelle 2026 — backlog (figée au classeur)</h3>
        <p className="text-xs text-gray-400 mb-4">
          Nouvelles demandes / terminées / soldées par mois et backlog cumulé (feuille KPI METAL)
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={kpi.backlogMensuel2026}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
            <Tooltip formatter={(v) => formatNombre(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="nouvellesDemandes" name="Nouvelles demandes" fill={COLOR_PREV} maxBarSize={18} radius={[3, 3, 0, 0]} />
            <Bar dataKey="terminees" name="Terminées" fill={COLOR_REEL} maxBarSize={18} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="backlogCumule" name="Backlog cumulé" stroke={COLOR_BACKLOG} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <RepartitionCard titre="Répartition par type de travaux" lignes={parTypeTravaux} />
        <RepartitionCard titre="Répartition par statut d'affaires" lignes={parStatut} />
        <RepartitionCard titre="Répartition par plateforme" lignes={parPlateforme} compact />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {kpi.budgetsParChamp.map((b) => (
          <div key={b.champ} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">CHAMP {b.champ}</h3>
              <span className="text-xs text-gray-400">Part fixe / Part variable (XAF)</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Mois</th>
                    <th className="px-4 py-2 font-medium text-right">Part fixe</th>
                    <th className="px-4 py-2 font-medium text-right">Part variable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {b.mensuel.map((m) => (
                    <tr key={m.mois}>
                      <td className="px-4 py-2 text-gray-900">{m.mois}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNombre(m.partFixe)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNombre(m.partVariable)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold text-gray-900">
                    <td className="px-4 py-2">Total général</td>
                    <td className="px-4 py-2 text-right">{formatNombre(b.totalPartFixe)}</td>
                    <td className="px-4 py-2 text-right">{formatNombre(b.totalPartVariable)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Faits marquants de la semaine</h3>
        <p className="text-xs text-gray-400 mb-3">
          Sections de saisie hebdomadaire de la feuille KPI METAL — vides dans le classeur au moment de l'extraction
        </p>
        <ul className="space-y-2 text-sm text-gray-600">
          {referentiel.intitulesFaitsMarquants.map((t) => (
            <li key={t} className="flex justify-between gap-4 border-b border-gray-100 pb-2">
              <span>{t}</span>
              <span className="text-gray-400">—</span>
            </li>
          ))}
          <li className="flex justify-between gap-4 border-b border-gray-100 pb-2">
            <span>KPI UNISUP — Avis / OT Métal créés et clôturés dans la semaine</span>
            <span className="text-gray-400">—</span>
          </li>
          <li className="flex justify-between gap-4">
            <span>Autres commentaires / points bloquants</span>
            <span className="text-gray-400">—</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

function RepartitionCard({ titre, lignes, compact = false }: { titre: string; lignes: { libelle: string; nombre: number }[]; compact?: boolean }) {
  const total = lignes.reduce((s, l) => s + l.nombre, 0)
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">{titre}</h3>
      </div>
      <div className={compact ? 'max-h-80 overflow-y-auto' : ''}>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {lignes.map((l) => (
              <tr key={l.libelle}>
                <td className="px-5 py-2 text-gray-900">{l.libelle}</td>
                <td className="px-5 py-2 text-right text-gray-600">{formatNombre(l.nombre)}</td>
                <td className="px-5 py-2 text-right text-gray-400 w-16">{formatPercent(l.nombre / total)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold text-gray-900">
              <td className="px-5 py-2">Total</td>
              <td className="px-5 py-2 text-right">{formatNombre(total)}</td>
              <td className="px-5 py-2 text-right">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
