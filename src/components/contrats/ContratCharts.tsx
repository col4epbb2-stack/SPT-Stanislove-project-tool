import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNombre } from '../../lib/format'
import { AXIS_TICK, COLOR_CIBLE, COLOR_CONSOMME } from './chartConstants'

export function ChartCard({ title, height = 200, children }: { title: string; height?: number; children: React.ReactElement }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-500 mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

// Répartition (BC/site/service) — part-to-whole, peu de catégories au
// libellé court -> barres horizontales (skill dataviz "choosing-a-form").
export function RepartitionChart({ data }: { data: { label: string; montant: number }[] }) {
  return (
    <BarChart data={data} layout="vertical" margin={{ left: 8, right: 28 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
      <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => formatNombre(Number(v))} />
      <YAxis dataKey="label" type="category" width={110} tick={AXIS_TICK} />
      <Tooltip formatter={(v) => formatNombre(Number(v))} />
      <Bar dataKey="montant" radius={[0, 4, 4, 0]} maxBarSize={18}>
        {data.map((d) => (
          <Cell key={d.label} fill={COLOR_CONSOMME} />
        ))}
      </Bar>
    </BarChart>
  )
}

/**
 * Évolution dans le temps — la consommation, et **en option la valeur cible**
 * qui la borne (`doc/module contrat.docx` §2 : « afficher correctement
 * l'évolution de la valeur cible sur les graphiques de suivi des
 * consommations »).
 *
 * La cible est tracée **en escalier** (`stepAfter`) et non en courbe : elle ne
 * progresse pas continûment, elle saute le jour d'un AVC. En pointillé gris et
 * sans point : c'est un repère, pas une seconde mesure. La légende n'apparaît
 * que lorsqu'il y a deux séries à distinguer.
 */
export function EvolutionChart({ data }: { data: { periode: string; montant: number; cible?: number }[] }) {
  const avecCible = data.some((d) => d.cible !== undefined)
  return (
    <LineChart data={data} margin={{ top: 8, right: 16 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
      <XAxis dataKey="periode" tick={AXIS_TICK} />
      <YAxis tick={AXIS_TICK} tickFormatter={(v) => formatNombre(Number(v))} />
      <Tooltip formatter={(v) => formatNombre(Number(v))} />
      {avecCible && <Legend wrapperStyle={{ fontSize: 11 }} />}
      <Line type="monotone" dataKey="montant" name="Consommation" stroke={COLOR_CONSOMME} strokeWidth={2} dot={{ r: 3 }} />
      {avecCible && (
        <Line
          type="stepAfter"
          dataKey="cible"
          name="Valeur cible"
          stroke={COLOR_CIBLE}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
        />
      )}
    </LineChart>
  )
}
