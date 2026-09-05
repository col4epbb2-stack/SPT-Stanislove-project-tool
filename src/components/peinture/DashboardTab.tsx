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
import type { ParametresContratPeinture, PeintureDashboard, PeintureReferentiel } from '../../types/contratPeinture'
import {
  cibleJournaliereSite,
  tauxProductiviteSite,
  tauxRealisationSite,
} from '../../lib/contratPeinturePerformance'
import { formatNombre, formatPercent } from '../../lib/format'
import { StatCard } from './elements'
import { COLOR_CIBLE, COLOR_POINTAGE, COLOR_STANDBY } from './couleurs'
import { useMontant } from '../../lib/montantAffiche'

// Onglet "Tableau de bord" — extrait de pages/ContratPeinturePage.tsx le
// 06/08/2026 (voir JournalTab.tsx). Reprise fidèle de la feuille Feuil3 /
// Synthèse_Facturation (valeurs figées du reporting pour ce qui n'est pas
// dérivable du journal).
//
// **Deux taux et la cible cessent d'être figés (27/08/2026, lot 6)** :
//   - « Réalisation » = réalisé / plan de charge et « Productivité » =
//     réalisé / cible sont désormais **calculés** au lieu d'être repris du
//     blob. Vérifiés à l'identique sur les 3 sites avant la bascule
//     (0,838644 · 0,806118 · 0,973572 et 0,71817 · 0,811077 · 0,515742) ;
//   - la **cible journalière** est lue dans Paramètres › Contrat peinture, où
//     elle vaut exactement ce que porte le blob (10 m² sur les 31 points des
//     3 sites, vérifié). C'est ce qui fait qu'un changement d'objectif
//     contractuel se voit enfin sur la courbe.
//
// Le **plan de charge et le réalisé restent ceux du classeur** : ils ne sont
// pas reproductibles depuis le JOURNAL — vérifié, 222,63 m² au blob contre
// 533,54 m² en sommant les surfaces réalisées du journal sur AGM, et plusieurs
// journées divergent. C'est un pivot de la feuille Feuil3 avec sa propre
// logique, pas une somme du journal.

const axisDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function DashboardTab({
  dashboard,
  parametres,
  parametresContrat,
}: {
  dashboard: PeintureDashboard
  parametres: PeintureReferentiel['parametres']
  /** Paramètres éditables du contrat (lot 1) — cible journalière. */
  parametresContrat: ParametresContratPeinture | null
}) {
  const { montant: formatMontant } = useMontant()
  const { avancementGeneral, avancementParAffaire, courbesParSite, coutsKomodo, valeurCible, standByParSite, syntheseFacturationParSite } = dashboard

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Avancement général prévisionnel" value={formatPercent(avancementGeneral.previsionnel)} />
        <StatCard label="Avancement général réel" value={formatPercent(avancementGeneral.reel)} />
        <StatCard label="Valeur cible (KOMODO)" value={formatMontant(valeurCible.total ?? 0, 'XAF')} />
        <StatCard
          label="Engagement contractuel"
          value={formatMontant(parametres.engagementKusd, 'KUSD')}
          detail={`Réalisé : ${formatMontant(parametres.realiseKusd, 'KUSD')}`}
        />
        <StatCard label="Réparation câble" value={formatMontant(valeurCible.reparationCable ?? 0, 'XAF')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {courbesParSite.map((c) => {
          const cible = cibleJournaliereSite(parametresContrat, c.site, c.totalCible / (c.points.length || 1))
          const points = c.points.map((p) => ({ ...p, cible }))
          const totalCible = cible * c.points.length
          const courbe = { ...c, points, totalCible }
          const tauxRealisation = tauxRealisationSite(courbe)
          const tauxProductivite = tauxProductiviteSite(courbe)
          return (
          <div key={c.site} className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-900">{c.site}</h3>
              <div className="flex gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  Réalisation {formatPercent(tauxRealisation)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  Productivité {formatPercent(tauxProductivite)}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Plan de charge {formatNombre(c.totalPlanCharge, 1)} m² · réalisé {formatNombre(c.totalRealise, 1)} m² ·
              cible {formatNombre(totalCible)} m²
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={axisDate} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={28} />
                <Tooltip labelFormatter={(d) => axisDate(String(d))} formatter={(v) => `${formatNombre(Number(v), 2)} m²`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="realise" name="Surface réalisée" fill={COLOR_POINTAGE} maxBarSize={10} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="planCharge" name="Plan de charge prév." stroke={COLOR_STANDBY} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cible" name="Cible (m²/j)" stroke={COLOR_CIBLE} strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Avancement corrigé par affaire</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Nom du projet / affaire</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">N° de l'avis</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">% prévisionnel</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">% réel</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Surface totale moyenne (m²)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {avancementParAffaire.map((a) => (
                <tr key={a.affaire}>
                  <td className="px-3 py-2 font-medium text-gray-900 max-w-96 truncate" title={a.affaire}>
                    {a.affaire}
                  </td>
                  <td className="px-3 py-2 max-w-52 truncate" title={a.avis ?? undefined}>
                    {a.avis ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatPercent(a.pctPrevisionnel)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatPercent(a.pctReel)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(a.surfaceMoyenne, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Suivi des coûts vs valeur cible (KOMODO)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium whitespace-nowrap"></th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Matériel</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Personnel</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Mat + Pers</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Autres</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Hors KOMODO</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">KOMODO</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Coût total</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Valeur cible</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Dépassement</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Totaux</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coutsKomodo.map((k) => (
                  <tr key={k.type}>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{k.type}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(k.materiel)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(k.personnel)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(k.matPers)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(k.autres)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatMontant(k.coutTotalHorsKomodo, 'XAF')}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(k.komodo)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatMontant(k.coutTotal, 'XAF')}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(k.valeurCible)}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${k.depassement > 0 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                      {formatNombre(k.depassement)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatNombre(k.totaux)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Valeur cible par site &amp; reporting</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">Libellé</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Valeur cible</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Reporting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {valeurCible.reporting.map((r) => (
                    <tr key={r.label}>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.label}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNombre(r.cible)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNombre(r.reporting)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2">Valeur cible totale</td>
                    <td className="px-3 py-2 text-right">{formatNombre(valeurCible.total)}</td>
                    <td className="px-3 py-2 text-right"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Stand-by par site (Synthèse_Facturation)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">Site</th>
                    <th className="px-3 py-2 font-medium">Type d'item</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Qté (h)</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Coût</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {standByParSite.map((s) => (
                    <tr key={s.site}>
                      <td className="px-3 py-2 font-medium text-gray-900">{s.site}</td>
                      <td className="px-3 py-2">{s.typeItem}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.qte)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatMontant(s.cout, 'XAF')}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2">Total général</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right">{formatNombre(standByParSite.reduce((s, x) => s + x.qte, 0))}</td>
                    <td className="px-3 py-2 text-right">{formatMontant(standByParSite.reduce((s, x) => s + x.cout, 0), 'XAF')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Facturation par site — avant / après révision</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Qté</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Coût total au pointage</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Part</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Avant</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Après</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {syntheseFacturationParSite.map((s) => (
                <tr key={s.site}>
                  <td className="px-3 py-2 font-medium text-gray-900">{s.site}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.qte)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatMontant(s.coutTotalPointage, 'XAF')}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatPercent(s.part)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.avant)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.apres)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-3 py-2">Total général</td>
                <td className="px-3 py-2 text-right">{formatNombre(syntheseFacturationParSite.reduce((s, x) => s + x.qte, 0))}</td>
                <td className="px-3 py-2 text-right">
                  {formatMontant(syntheseFacturationParSite.reduce((s, x) => s + x.coutTotalPointage, 0), 'XAF')}
                </td>
                <td className="px-3 py-2 text-right">100%</td>
                <td className="px-3 py-2 text-right">
                  {formatNombre(syntheseFacturationParSite.reduce((s, x) => s + (x.avant ?? 0), 0))}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatNombre(syntheseFacturationParSite.reduce((s, x) => s + (x.apres ?? 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
