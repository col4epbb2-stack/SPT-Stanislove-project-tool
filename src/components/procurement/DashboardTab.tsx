import type {
  DashboardPrepMateriel,
  JournalDaProcurement,
  JournalPoProcurement,
  ProcurementCharts,
} from '../../types/procurementFollowUp'
import { evenementsVersHisto } from '../../lib/procurementFollowUpEngine'
import { formatDate, formatNombre, formatPercent } from '../../lib/format'
import { HistoDureeChart, JaugesChart, StatCard } from './elements'

// Onglet "Dashboard préparation matériel" — extrait de
// pages/ProcurementFollowUpPage.tsx le 06/08/2026 (voir JournalPoTab.tsx).
// Contenu inchangé : compteurs et séries repris tels quels du classeur.

export function DashboardTab({
  charts,
  journalDa,
  journalPo,
  dashPrep,
}: {
  charts: ProcurementCharts
  journalDa: JournalDaProcurement
  journalPo: JournalPoProcurement
  dashPrep: DashboardPrepMateriel
}) {
  const p = journalPo.parametres
  const memo = dashPrep.memoSurveillance
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Date critique"
          value={p.dateCritique ? formatDate(p.dateCritique) : '—'}
          detail={`Début du projet : ${p.debutProjet ? formatDate(p.debutProjet) : '—'} · durée ${formatNombre(p.dureeJours)} j`}
        />
        <StatCard label="Délai d'arrivée maritime" value={p.delaiMaritime ?? '—'} />
        <StatCard label="Délai d'arrivée aérien" value={p.delaiAerien ?? '—'} />
        <StatCard
          label="DA au journal"
          value={formatNombre(journalDa.das.length)}
          detail={`${formatNombre(journalDa.resumeStatuts.inProgress)} in progress · ${formatNombre(journalDa.resumeStatuts.closed)} closed`}
        />
        <StatCard label="Plateformes couvertes" value={formatNombre(dashPrep.nombrePlateformes)} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
        <h3 className="font-semibold text-gray-900 mb-1">{memo.objet ?? 'Point hebdo Surveillance'}</h3>
        <p className="text-sm text-gray-500">
          Expéditeur : <span className="text-gray-900">{memo.expediteurNom ?? '—'}</span> ({memo.expediteurFonction ?? '—'})
          — Distribution : {memo.distribution ?? '—'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <JaugesChart
          titre="Avancement global"
          jauges={[
            {
              libelle: charts.prep.avancementGlobal.libelle ?? 'PROJET',
              avancement: charts.prep.avancementGlobal.pct,
              restant: charts.prep.avancementGlobal.restant,
            },
          ]}
          hauteur={110}
        />
        <JaugesChart
          titre="Avancement par objet (MTO/OT, DA, PO)"
          jauges={charts.prep.avancementParObjet.map((o) => ({
            libelle: o.objet ?? '—',
            avancement: o.pct,
            restant: o.restant,
          }))}
        />
      </div>

      <HistoDureeChart
        titre="LIVRAISON EXW — durée par PO"
        data={evenementsVersHisto(charts.prep.livraisonExw)}
        limite={charts.prep.limiteJours}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HistoDureeChart
          titre="ETA (maritime)"
          data={evenementsVersHisto(charts.prep.etaMaritime)}
          limite={charts.prep.limiteJours}
        />
        <HistoDureeChart
          titre="ETA (aérien)"
          data={evenementsVersHisto(charts.prep.etaAerien)}
          limite={charts.prep.limiteJours}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">
            {dashPrep.titre} par scope ({dashPrep.scopes.length} scopes)
          </h3>
          <p className="text-xs text-gray-400">
            Trois blocs de compteurs repris tels quels de la feuille (réceptions puis deux blocs de création, non
            nommés dans le classeur)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">À créer</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Reçus</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">À recevoir</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">%</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap border-l border-gray-100">À créer</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Créés</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Non créés</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">%</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap border-l border-gray-100">À créer</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Créés</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Non créés</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dashPrep.scopes.map((s) => (
                <tr key={s.scope}>
                  <td className="px-3 py-2 text-gray-900 max-w-80 truncate" title={s.scope}>
                    {s.scope}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.reception.aCreer)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.reception.faits)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.reception.restants)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatPercent(s.reception.pct, 0)}</td>
                  <td className="px-3 py-2 text-right text-gray-600 border-l border-gray-100">{formatNombre(s.bloc2.aCreer)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.bloc2.faits)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.bloc2.restants)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatPercent(s.bloc2.pct, 0)}</td>
                  <td className="px-3 py-2 text-right text-gray-600 border-l border-gray-100">{formatNombre(s.bloc3.aCreer)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.bloc3.faits)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatNombre(s.bloc3.restants)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatPercent(s.bloc3.pct, 0)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-3 py-2">Total général</td>
                <td className="px-3 py-2 text-right">{formatNombre(dashPrep.totaux.reception.aCreer)}</td>
                <td className="px-3 py-2 text-right">{formatNombre(dashPrep.totaux.reception.faits)}</td>
                <td className="px-3 py-2 text-right">{formatNombre(dashPrep.totaux.reception.restants)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(dashPrep.totaux.reception.pct, 0)}</td>
                <td className="px-3 py-2 text-right border-l border-gray-100">{formatNombre(dashPrep.totaux.bloc2.aCreer)}</td>
                <td className="px-3 py-2 text-right">{formatNombre(dashPrep.totaux.bloc2.faits)}</td>
                <td className="px-3 py-2 text-right">{formatNombre(dashPrep.totaux.bloc2.restants)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(dashPrep.totaux.bloc2.pct, 0)}</td>
                <td className="px-3 py-2 text-right border-l border-gray-100">{formatNombre(dashPrep.totaux.bloc3.aCreer)}</td>
                <td className="px-3 py-2 text-right">{formatNombre(dashPrep.totaux.bloc3.faits)}</td>
                <td className="px-3 py-2 text-right">{formatNombre(dashPrep.totaux.bloc3.restants)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(dashPrep.totaux.bloc3.pct, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
