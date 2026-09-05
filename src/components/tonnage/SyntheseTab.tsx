import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type {
  LigneJournalTonnage,
  ObjectifJournalierChamp,
  ParametresContratTonnage,
  TonnageContrat,
} from '../../types/tonnageEchaf'
import {
  courbeMontageCumulee,
  mutualisationParChamp,
  repartitionParChamp,
  retardParChamp,
  savingDemontageCout,
  tonnageCumuleParSite,
} from '../../lib/tonnageEchafEngine'
import { formatDate, formatNombre } from '../../lib/format'
import { selectFiltreClass } from '../ui/classes'
import { useMontant } from '../../lib/montantAffiche'

// Onglet "Synthèse" du module Tonnage échafaudage — extrait de
// pages/TonnageEchafPage.tsx le 06/08/2026 (voir JournalTab.tsx). Contenu
// inchangé : tout y est recalculé depuis les lignes de détail par
// lib/tonnageEchafEngine.ts. Mutualisation et courbe de cartographie
// ajoutées le 03/09/2026 (lot 6, `doc/Suivi tonnage rev01.docx` §H/§I/§L) —
// même principe, dérivées, à côté de la reproduction figée de l'onglet
// SUIVI TONNAGE_ECHAF, qu'elles ne remplacent pas.

const COLOR_CORE_CREW = '#4f46e5'
const COLOR_HORS_CORE_CREW = '#d97706'
const COLOR_CIBLE = '#10b981'
const COLOR_SITE = '#0ea5e9'

function StatCard({ label, value, negatif = false }: { label: string; value: string; negatif?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${negatif ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

export function SyntheseTab({
  journal,
  contrat,
  objectifJournalierChamp,
  parametres,
}: {
  journal: LigneJournalTonnage[]
  contrat: TonnageContrat
  objectifJournalierChamp: ObjectifJournalierChamp[]
  parametres: ParametresContratTonnage
}) {
  const { montant: formatMontant, uniteAffichee } = useMontant()
  const parChamp = useMemo(() => repartitionParChamp(journal, contrat), [journal, contrat])
  const retards = useMemo(() => retardParChamp(journal, contrat), [journal, contrat])
  const totalSaving = useMemo(
    () => journal.reduce((s, l) => s + (savingDemontageCout(l, contrat) ?? 0), 0),
    [journal, contrat]
  )
  const [champCourbe, setChampCourbe] = useState<'AGM' | 'IM' | 'TRM'>('AGM')
  const courbe = useMemo(
    () =>
      courbeMontageCumulee(journal, contrat, objectifJournalierChamp, champCourbe).map((p) => ({
        date: p.date,
        coreCrew: p.cumulCoreCrew,
        horsCoreCrew: p.cumulHorsCoreCrew,
        cible: p.cibleTheorique,
      })),
    [journal, contrat, objectifJournalierChamp, champCourbe]
  )

  // Mutualisation dérivée (lot 6, §H/§I) : forfait du champ choisi, lu dans
  // les paramètres du contrat — sans lui, la mutualisation n'a pas de
  // référence, `champMutualisation` reste alors sans tableau.
  const [champMutualisation, setChampMutualisation] = useState<'AGM' | 'IM' | 'TRM'>('AGM')
  const forfaitChamp = parametres.champs.find((c) => c.champ === champMutualisation)?.forfaitMaterielTonnesJour ?? null
  const mutualisation = useMemo(
    () => (forfaitChamp != null ? mutualisationParChamp(journal, contrat, forfaitChamp, champMutualisation) : []),
    [journal, contrat, forfaitChamp, champMutualisation]
  )
  const soldeActuel = mutualisation.length ? mutualisation[mutualisation.length - 1].soldeCumuleApres : 0
  const totalFacturableHorsForfait = mutualisation.reduce((s, j) => s + j.facturableHorsForfait, 0)

  // Courbe de cartographie (lot 6, §L, TON1-58) : tonnage cumulé par site,
  // dérivé de l'exercice 2026 chargé — cf. le commentaire de
  // `tonnageCumuleParSite` sur pourquoi ces valeurs ne cherchent pas à
  // reproduire la capture du document (Q9 du recueil).
  const parSite = useMemo(() => tonnageCumuleParSite(journal, contrat), [journal, contrat])

  const totalPerteXaf = retards.reduce((s, r) => s + r.cumulPerteXaf, 0)
  const totalPerteTonnes = retards.reduce((s, r) => s + r.cumulPerteTonnes, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Coût à la tonne (contrat)" value={formatMontant(contrat.coutTonne ?? 0, 'XAF')} />
        <StatCard label="Saving démontage cumulé" value={formatMontant(totalSaving, 'XAF')} negatif={totalSaving < 0} />
        <StatCard
          label="Perte estimée à date (échéances dépassées)"
          value={formatMontant(totalPerteXaf, 'XAF')}
          negatif={totalPerteXaf > 0}
        />
        <StatCard label="Perte estimée à date (tonnes-jours)" value={formatNombre(totalPerteTonnes, 1)} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Répartition par champ</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Champ</th>
                <th className="px-5 py-3 font-medium text-right">Nombre d'affaires</th>
                <th className="px-5 py-3 font-medium text-right">Poids contractuel total (T)</th>
                <th className="px-5 py-3 font-medium text-right">Monté</th>
                <th className="px-5 py-3 font-medium text-right">Démonté</th>
                <th className="px-5 py-3 font-medium text-right">En attente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parChamp.map((c) => (
                <tr key={c.champ}>
                  <td className="px-5 py-3 font-medium text-gray-900">{c.champ}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(c.nombre)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(c.poidsContractuelTotal, 2)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(c.monte)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(c.demonte)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(c.enAttente)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-5 py-3">Total général</td>
                <td className="px-5 py-3 text-right">{formatNombre(parChamp.reduce((s, c) => s + c.nombre, 0))}</td>
                <td className="px-5 py-3 text-right">
                  {formatNombre(
                    parChamp.reduce((s, c) => s + c.poidsContractuelTotal, 0),
                    2
                  )}
                </td>
                <td className="px-5 py-3 text-right">{formatNombre(parChamp.reduce((s, c) => s + c.monte, 0))}</td>
                <td className="px-5 py-3 text-right">{formatNombre(parChamp.reduce((s, c) => s + c.demonte, 0))}</td>
                <td className="px-5 py-3 text-right">{formatNombre(parChamp.reduce((s, c) => s + c.enAttente, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">
            Retard et perte estimée cumulés par champ (échafaudages toujours montés au-delà de l'échéance)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Champ</th>
                <th className="px-5 py-3 font-medium text-right">Affaires en retard</th>
                <th className="px-5 py-3 font-medium text-right">Cumul retard (jours)</th>
                <th className="px-5 py-3 font-medium text-right">Cumul perte ({uniteAffichee('XAF')})</th>
                <th className="px-5 py-3 font-medium text-right">Cumul perte (tonnes-jours)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {retards.map((r) => (
                <tr key={r.champ}>
                  <td className="px-5 py-3 font-medium text-gray-900">{r.champ}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(r.nombreEnRetard)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(r.cumulRetardJours)}</td>
                  <td className="px-5 py-3 text-right text-red-600 font-medium">
                    {formatMontant(r.cumulPerteXaf, 'XAF')}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatNombre(r.cumulPerteTonnes, 1)}</td>
                </tr>
              ))}
              {retards.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                    Aucun échafaudage en retard.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Tonnage monté cumulé vs cible théorique</h3>
          <select
            value={champCourbe}
            onChange={(e) => setChampCourbe(e.target.value as 'AGM' | 'IM' | 'TRM')}
            className={selectFiltreClass}
          >
            <option value="AGM">AGM</option>
            <option value="IM">IM</option>
            <option value="TRM">TRM</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Cumul recalculé depuis les dates de montage réelles du Journal (lignes 2026), cible théorique reprise de la
          feuille Prod.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={courbe}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)}
              minTickGap={20}
            />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => formatNombre(v, 1)} />
            <Tooltip formatter={(v) => formatNombre(Number(v), 2)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="coreCrew" name="Tonnage cumulé Core crew" stackId="t" fill={COLOR_CORE_CREW} maxBarSize={26} />
            <Bar
              dataKey="horsCoreCrew"
              name="Tonnage cumulé hors Core crew"
              stackId="t2"
              fill={COLOR_HORS_CORE_CREW}
              maxBarSize={26}
            />
            <Line
              type="monotone"
              dataKey="cible"
              name="Objectif de production journalier (cible)"
              stroke={COLOR_CIBLE}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* --- §H/§I : mutualisation du forfait matériel, dérivée --------- */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Mutualisation du forfait matériel</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Le solde non consommé un jour compense un dépassement les jours suivants — dérivé du Journal, pas de
              l'onglet SUIVI TONNAGE_ECHAF (figé à juin 2026).
            </p>
          </div>
          <select
            value={champMutualisation}
            onChange={(e) => setChampMutualisation(e.target.value as 'AGM' | 'IM' | 'TRM')}
            className={selectFiltreClass}
          >
            <option value="AGM">AGM</option>
            <option value="IM">IM</option>
            <option value="TRM">TRM</option>
          </select>
        </div>
        {forfaitChamp == null ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            Aucun forfait matériel réglé pour {champMutualisation} dans Paramètres › Tonnage échafaudage.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Forfait Core crew</p>
                <p className="text-lg font-semibold text-gray-900">{formatNombre(forfaitChamp, 1)} T / jour</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Solde cumulé disponible, à date</p>
                <p className={`text-lg font-semibold ${soldeActuel < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatNombre(soldeActuel, 2)} T
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Cumul facturable hors forfait</p>
                <p className={`text-lg font-semibold ${totalFacturableHorsForfait > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                  {formatNombre(totalFacturableHorsForfait, 2)} T
                </p>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium text-right">Consommé (T)</th>
                    <th className="px-4 py-2 font-medium text-right">Inclus forfait (T)</th>
                    <th className="px-4 py-2 font-medium text-right">Dépassement (T)</th>
                    <th className="px-4 py-2 font-medium text-right">Économie du jour (T)</th>
                    <th className="px-4 py-2 font-medium text-right">Solde avant (T)</th>
                    <th className="px-4 py-2 font-medium text-right">Compensation (T)</th>
                    <th className="px-4 py-2 font-medium text-right">Facturable hors forfait (T)</th>
                    <th className="px-4 py-2 font-medium text-right">Solde après (T)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mutualisation.map((j) => (
                    <tr key={j.date}>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-900">{formatDate(j.date)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNombre(j.consomme, 2)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNombre(j.forfaitInclus, 2)}</td>
                      <td className={`px-4 py-2 text-right ${j.depassementBrut > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                        {formatNombre(j.depassementBrut, 2)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNombre(j.economieDuJour, 2)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNombre(j.soldeCumuleAvant, 2)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNombre(j.compensation, 2)}</td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${
                          j.facturableHorsForfait > 0 ? 'text-red-600' : 'text-gray-600'
                        }`}
                      >
                        {formatNombre(j.facturableHorsForfait, 2)}
                      </td>
                      <td className={`px-4 py-2 text-right ${j.soldeCumuleApres < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {formatNombre(j.soldeCumuleApres, 2)}
                      </td>
                    </tr>
                  ))}
                  {mutualisation.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                        Aucune ligne montée sur ce champ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* --- §L : courbe de la cartographie (tonnage cumulé/plateformes) - */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Tonnage cumulé par plateforme</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            « Combien de tonnes on a dans X ou Y plateforme » — dérivé du Journal (`site`), sur l'exercice 2026
            chargé.
          </p>
        </div>
        <div className="p-5 pb-0">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={parSite}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="site" tick={{ fontSize: 10, fill: '#6b7280' }} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={38} />
              <Tooltip formatter={(v) => `${formatNombre(Number(v), 2)} T`} />
              <Bar dataKey="tonnage" name="Tonnage cumulé (T)" fill={COLOR_SITE} maxBarSize={26} radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto border-t border-gray-100 max-h-64">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Plateforme</th>
                <th className="px-4 py-2 font-medium text-right">Tonnage cumulé (T)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parSite.map((l) => (
                <tr key={l.site}>
                  <td className="px-4 py-2 text-gray-900">{l.site}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatNombre(l.tonnage, 2)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-4 py-2">Total général</td>
                <td className="px-4 py-2 text-right">
                  {formatNombre(
                    parSite.reduce((s, l) => s + l.tonnage, 0),
                    2
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
