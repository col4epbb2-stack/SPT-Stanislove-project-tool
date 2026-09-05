import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatNombre } from '../../lib/format'
import { PIE_COLORS } from './couleurs'

// Briques d'affichage communes aux 4 onglets du module Contrat peinture,
// extraites de pages/ContratPeinturePage.tsx le 06/08/2026.

export function StatCard({
  label,
  value,
  negatif = false,
  detail,
}: {
  label: string
  value: string
  negatif?: boolean
  detail?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${negatif ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  )
}

export function PieStandByCard({
  titre,
  data,
  couleurs,
  unite,
}: {
  titre: string
  data: { name: string; value: number }[]
  couleurs: Map<string, string>
  unite: string
}) {
  const total = data.reduce((s, e) => s + e.value, 0)
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-1">{titre}</h3>
      <p className="text-xs text-gray-400 mb-2">
        Total : {formatNombre(total, 1)} {unite}
      </p>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">Aucune ligne de stand-by dans la sélection.</p>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={0}
              outerRadius={80}
              paddingAngle={1.5}
              stroke="#ffffff"
              strokeWidth={2}
              label={(p) => `${(((p.percent as number | undefined) ?? 0) * 100).toFixed(1)}%`}
              labelLine={{ stroke: '#9ca3af' }}
            >
              {data.map((e) => (
                <Cell key={e.name} fill={couleurs.get(e.name) ?? PIE_COLORS[0]} />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [`${formatNombre(Number(v), 1)} ${unite}`, String(n)]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
