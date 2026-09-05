import { History, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { EtatVide } from '../ui/EtatVide'
import type { LigneNavette } from '../../types/navette'
import {
  CYCLE_BUDGET_LABELS,
  POSTES_BUDGET,
  historiqueRealiseYTD,
  totalBudget,
  type ArbitrageNavette,
} from '../../types/navette'
import { uniteMontant } from '../../types/devise'
import { useMontant } from '../../lib/montantAffiche'

// Historique du réalisé à date (YTD) d'une ligne navette (23/08/2026, demande
// explicite : « un historique du Réalisé à date (YTD) qui dépendra de la
// révision d'un PDC qui a été faite, fais un onglet pour voir ça »).
//
// Une entrée = une **révision validée** de la ligne, et le réalisé YTD figé au
// moment où elle a été appliquée (`ArbitrageNavette.realiseYTDAuVisa`). Rien
// n'est recalculé ici : ce serait afficher le réalisé d'aujourd'hui sous la
// date d'une décision passée.

const LIBELLE_POSTE: Record<(typeof POSTES_BUDGET)[number], string> = {
  conso: 'CONSO',
  serv: 'SERV',
  log: 'LOG',
  pers: 'PERS',
  autres: 'AUTRES',
}

export function HistoriqueRealiseYTD({
  ligne,
  arbitrages,
  nomUtilisateur,
}: {
  ligne: LigneNavette
  arbitrages: ArbitrageNavette[]
  nomUtilisateur: (id?: string) => string
}) {
  const { montant: formatMontant } = useMontant()
  // Les cycles d'une ligne sont comptés en milliers de SA devise, comme le
  // tableau des 8 cycles de l'onglet voisin.
  const unite = uniteMontant(ligne.devise, 'millier')
  const releves = historiqueRealiseYTD(arbitrages, ligne.id)
  const realiseCourant = ligne.cycles.realiseYTD
  const dernierReleve = [...releves].reverse().find((r) => r.total !== null) ?? null

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
        <p className="text-xs font-medium text-gray-500 mb-1.5">Réalisé à date (YTD) — valeur actuelle de la ligne</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">
          {formatMontant(totalBudget(realiseCourant), unite)}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
          {POSTES_BUDGET.map((poste) => (
            <span key={poste} className="tabular-nums">
              {LIBELLE_POSTE[poste]} : {formatMontant(realiseCourant[poste], unite)}
            </span>
          ))}
        </div>
        {/* Dit d'où vient ce chiffre : sans ça, un historique de relevés
            identiques passerait pour un défaut de l'écran. */}
        <p className="text-xs text-gray-400 mt-2">
          Ce cycle n'est pas saisi dans l'application : il vient du classeur importé. Deux révisions successives
          peuvent donc relever la même valeur.
        </p>
      </div>

      {releves.length === 0 ? (
        <EtatVide
          icone={History}
          titre="Aucune révision validée"
          description="Le réalisé à date est relevé au moment où une révision PDC est appliquée. Cette ligne n'en a encore aucune."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Révision appliquée</th>
                <th className="py-2 px-3 font-medium text-right">Montant révisé</th>
                <th className="py-2 px-3 font-medium text-right">Réalisé à date</th>
                <th className="py-2 px-3 font-medium text-right">Variation</th>
                <th className="py-2 pl-3 font-medium">Appliquée par</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {releves.map((releve) => (
                <tr key={releve.arbitrageId}>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                    {new Date(releve.le).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-2 px-3">
                    <Badge label={CYCLE_BUDGET_LABELS[releve.cycleId]} bg="bg-primary/10" text="text-primary" />
                  </td>
                  <td className="py-2 px-3 text-right text-gray-600 tabular-nums">
                    {formatMontant(releve.montantRevision, unite)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-gray-900 tabular-nums">
                    {releve.total !== null ? (
                      formatMontant(releve.total, unite)
                    ) : (
                      // Révision validée avant l'introduction du relevé : elle
                      // reste dans l'historique — l'exclure laisserait croire
                      // qu'elle n'a pas eu lieu — mais sans réalisé prêté.
                      <span className="font-normal text-gray-400" title="Révision antérieure au relevé automatique">
                        Non relevé
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {releve.variation === null ? (
                      <span className="text-gray-300">—</span>
                    ) : releve.variation === 0 ? (
                      <span className="text-gray-400">Inchangé</span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          releve.variation > 0 ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {releve.variation > 0 ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5" />
                        )}
                        {releve.variation > 0 ? '+' : ''}
                        {formatMontant(releve.variation, unite)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-3 text-gray-600 whitespace-nowrap">{nomUtilisateur(releve.parId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* L'écart entre le dernier relevé et la valeur actuelle est la seule
          chose que l'historique seul ne montre pas : il dit si le réalisé a
          bougé depuis la dernière décision prise dessus. */}
      {dernierReleve && dernierReleve.total !== totalBudget(realiseCourant) && (
        <p className="text-xs text-gray-500">
          Depuis le dernier relevé ({new Date(dernierReleve.le).toLocaleDateString('fr-FR')}), le réalisé à date de la
          ligne a évolué de {formatMontant(totalBudget(realiseCourant) - (dernierReleve.total ?? 0), unite)}.
        </p>
      )}
    </div>
  )
}
