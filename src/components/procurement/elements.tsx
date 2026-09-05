import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { JaugeProcurement } from '../../types/procurementFollowUp'
import type { PointHistoDuree } from '../../lib/procurementFollowUpEngine'
import { formatNombre, formatPercent } from '../../lib/format'

// Briques d'affichage communes aux 7 onglets du module Procurement, extraites
// de pages/ProcurementFollowUpPage.tsx le 06/08/2026 : carte de chiffre clé,
// badge de statut, et les 3 familles de graphiques du classeur
// (histogrammes de durée vs date critique, jauges avancement/restant, ETA
// reçu/non reçu). Elles servent à plusieurs onglets, d'où ce fichier commun.

export const COULEUR_PRINCIPALE = '#4f46e5'
const COLOR_RESTANT = '#e5e7eb'
const COLOR_RECU = '#10b981'
const COLOR_NON_RECU = '#d97706'
const COLOR_LIMITE = '#e11d48'

export function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  )
}

export function StatutBadge({ statut }: { statut: string | null }) {
  const s = (statut ?? '').trim().toUpperCase()
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
        s === 'CLOSED'
          ? 'bg-emerald-100 text-emerald-700'
          : s
            ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-gray-500'
      }`}
    >
      {statut ?? '—'}
    </span>
  )
}

// Histogramme du classeur : durée (en jours depuis le début du projet) de
// chaque événement de livraison/ETA, comparée à la date critique (516 j).
export function HistoDureeChart({
  titre,
  data,
  limite,
  hauteur = 240,
}: {
  titre: string
  data: PointHistoDuree[]
  limite: number
  hauteur?: number
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-1">{titre}</h3>
      <p className="text-xs text-gray-400 mb-3">
        Durée en jours depuis le début du projet — ligne : date critique ({formatNombre(limite)} j)
      </p>
      <ResponsiveContainer width="100%" height={hauteur}>
        <ComposedChart data={data} margin={{ bottom: 30, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="libelle"
            tick={{ fontSize: 9, fill: '#6b7280' }}
            interval={data.length > 40 ? Math.floor(data.length / 30) : 0}
            angle={-45}
            textAnchor="end"
            height={58}
          />
          <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
          <Tooltip
            formatter={(v) => [`${formatNombre(Number(v))} j`, 'Durée']}
            labelFormatter={(l, payload) => {
              const p0 = payload?.[0]?.payload as { detail?: string } | undefined
              return p0?.detail ? `${l} — ${p0.detail}` : String(l)
            }}
          />
          <Bar dataKey="duree" name="Durée (j)" fill={COULEUR_PRINCIPALE} maxBarSize={16} radius={[3, 3, 0, 0]} />
          <ReferenceLine
            y={limite}
            stroke={COLOR_LIMITE}
            strokeDasharray="5 4"
            strokeWidth={2}
            label={{
              value: `Date critique (${limite} j)`,
              position: 'insideTopRight',
              fill: COLOR_LIMITE,
              fontSize: 11,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// Jauges du classeur : barres empilées avancement / restant (100 %).
export function JaugesChart({
  titre,
  jauges,
  hauteur,
}: {
  titre: string
  jauges: JaugeProcurement[]
  hauteur?: number
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-3">{titre}</h3>
      <ResponsiveContainer width="100%" height={hauteur ?? Math.max(120, jauges.length * 44)}>
        <BarChart data={jauges} layout="vertical" margin={{ left: 60, right: 46 }}>
          <XAxis type="number" domain={[0, 1]} hide />
          <YAxis dataKey="libelle" type="category" width={150} tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Tooltip formatter={(v, n) => [formatPercent(Number(v)), String(n)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="avancement"
            name="Avancement"
            stackId="j"
            fill={COULEUR_PRINCIPALE}
            maxBarSize={20}
            radius={[3, 0, 0, 3]}
          >
            <LabelList
              dataKey="avancement"
              position="right"
              formatter={(v: unknown) => formatPercent(Number(v), 0)}
              style={{ fill: '#374151', fontSize: 11 }}
            />
          </Bar>
          <Bar dataKey="restant" name="Restant" stackId="j" fill={COLOR_RESTANT} maxBarSize={20} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ETA reçu / non reçu (classeur : camembert-jauges "RECU / NON RECU").
export function RecuChart({ lignes }: { lignes: { libelle: string; recu: number; nonRecu: number }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-3">Réception ETA — LBV / POG</h3>
      <ResponsiveContainer width="100%" height={Math.max(110, lignes.length * 48)}>
        <BarChart data={lignes} layout="vertical" margin={{ left: 20, right: 46 }}>
          <XAxis type="number" domain={[0, 1]} hide />
          <YAxis dataKey="libelle" type="category" width={80} tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Tooltip formatter={(v, n) => [formatPercent(Number(v)), String(n)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="recu" name="Reçu" stackId="e" fill={COLOR_RECU} maxBarSize={22} radius={[3, 0, 0, 3]}>
            <LabelList
              dataKey="recu"
              position="right"
              formatter={(v: unknown) => formatPercent(Number(v), 0)}
              style={{ fill: '#374151', fontSize: 11 }}
            />
          </Bar>
          <Bar
            dataKey="nonRecu"
            name="Non reçu"
            stackId="e"
            fill={COLOR_NON_RECU}
            maxBarSize={22}
            radius={[0, 3, 3, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
