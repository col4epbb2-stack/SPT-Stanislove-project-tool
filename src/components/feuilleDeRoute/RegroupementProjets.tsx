import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers, Link2 } from 'lucide-react'
import { formatPercent } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'
import { usePreferenceAffichage } from '../../lib/preferencesAffichage'
import { selectFiltreClass } from '../ui/classes'
import { BarreProgression } from '../ui/TuileKpi'
import {
  CRITERES_REGROUPEMENT,
  TRIS_REGROUPEMENT,
  regrouperProjets,
  type CritereRegroupement,
  type TriRegroupement,
} from './regroupement'
import type { LigneFdr } from './colonnes'
import type { ProjetFeuilleDeRoute } from '../../types/feuilleDeRoute'

// Regroupements du portefeuille (20/08/2026, demande explicite « fais une
// section avec des regroupements des projets par catégories, mais une
// interface dynamique »).
//
// Le tableau de la feuille de route montre les projets ligne à ligne ; il ne
// dit pas ce que pèse une catégorie. Cette section répond à l'autre question :
// combien de projets, quel engagement, quel avancement, par catégorie.
//
// Ce qui la rend dynamique, et pourquoi c'est fait ainsi :
//  - **le critère se change** (catégorie par défaut, mais aussi année BU,
//    priorité, statut, service leader, champ) : ce sont les colonnes qui
//    découpent naturellement le portefeuille, et le calcul est le même ;
//  - **elle suit les filtres du tableau** — elle reçoit les lignes déjà
//    filtrées. Filtrer sur une année restreint aussi les regroupements, sinon
//    les deux vues de la même page se contrediraient ;
//  - **chaque groupe se déplie** sur ses projets, et un clic ouvre la fiche
//    déjà utilisée par le tableau (aucune seconde façon de lire un projet) ;
//  - le critère, le tri et l'état plié/déplié sont **gardés d'une session à
//    l'autre**, comme les colonnes visibles : c'est une préférence de poste,
//    pas une donnée métier.

/** Avancement d'une ligne : celui de la fiche liée, sinon celui du classeur. */
function avancementDe(ligne: LigneFdr): number | null {
  return ligne.avancement ?? ligne.p.avancementReel
}

export function RegroupementProjets({
  lignes,
  onOuvrirProjet,
}: {
  /** Lignes **déjà filtrées** par la page. */
  lignes: LigneFdr[]
  onOuvrirProjet: (projet: ProjetFeuilleDeRoute) => void
}) {
  const { montant, uniteAffichee } = useMontant()
  const [critere, setCritere] = usePreferenceAffichage<CritereRegroupement>('feuilleDeRoute.regroupement', 'categorie')
  const [tri, setTri] = usePreferenceAffichage<TriRegroupement>('feuilleDeRoute.regroupementTri', 'nombre')
  const [ouverte, setOuverte] = usePreferenceAffichage<boolean>('feuilleDeRoute.regroupementOuvert', true)
  // Groupes dépliés : volontairement **pas** persisté. Les clés dépendent du
  // critère et des données ; une liste gardée d'une session à l'autre
  // désignerait des groupes qui n'existent plus.
  const [deplies, setDeplies] = useState<string[]>([])

  const groupes = useMemo(() => regrouperProjets(lignes, critere, tri), [lignes, critere, tri])

  // Référence des barres de part : le plus gros groupe fait toute la largeur.
  // Rapporter au total ferait des barres illisibles dès qu'il y a 10 groupes.
  const maxProjets = groupes.reduce((n, g) => Math.max(n, g.lignes.length), 0)

  const basculer = (cle: string) =>
    setDeplies((prev) => (prev.includes(cle) ? prev.filter((c) => c !== cle) : [...prev, cle]))

  const libelleCritere = CRITERES_REGROUPEMENT.find((c) => c.id === critere)?.label ?? 'Catégorie'

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100">
        <button
          type="button"
          onClick={() => setOuverte(!ouverte)}
          className="flex items-center gap-2.5 min-w-0 text-left"
          aria-expanded={ouverte}
        >
          <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Layers className="w-4.5 h-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-gray-900">Regroupements par {libelleCritere.toLowerCase()}</span>
            <span className="block text-xs text-gray-500">
              {groupes.length} groupe(s) · {lignes.length} projet(s) affiché(s) — suit les filtres du tableau
            </span>
          </span>
          {ouverte ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </button>

        {ouverte && (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <label className="text-xs text-gray-400">Regrouper par</label>
            <select
              className={selectFiltreClass}
              value={critere}
              onChange={(e) => {
                setCritere(e.target.value as CritereRegroupement)
                // Les groupes dépliés désignent des clés du critère précédent.
                setDeplies([])
              }}
            >
              {CRITERES_REGROUPEMENT.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="text-xs text-gray-400">Trier par</label>
            <select
              className={selectFiltreClass}
              value={tri}
              onChange={(e) => setTri(e.target.value as TriRegroupement)}
            >
              {TRIS_REGROUPEMENT.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {ouverte && (
        <div className="divide-y divide-gray-100">
          {groupes.length === 0 && (
            <p className="px-5 py-6 text-sm text-gray-500">
              Aucun projet à regrouper — les filtres du tableau n'en laissent aucun.
            </p>
          )}

          {groupes.map((groupe) => {
            const deplie = deplies.includes(groupe.cle)
            return (
              <div key={groupe.cle || '__sans__'}>
                <button
                  type="button"
                  onClick={() => basculer(groupe.cle)}
                  aria-expanded={deplie}
                  className="w-full px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-gray-50/70 transition text-left"
                >
                  {deplie ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}

                  <span className="min-w-0 flex-1">
                    <span
                      className={`block font-semibold truncate ${
                        groupe.sansValeur ? 'text-gray-400 italic' : 'text-gray-900'
                      }`}
                    >
                      {groupe.libelle}
                    </span>
                    <span className="flex items-center gap-2 mt-1">
                      <span className="h-1.5 w-24 rounded-full bg-gray-100 overflow-hidden shrink-0">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${maxProjets > 0 ? (groupe.lignes.length / maxProjets) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {groupe.lignes.length} projet(s)
                      </span>
                      {groupe.liees > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <Link2 className="w-3 h-3" />
                          {groupe.liees} fiche(s)
                        </span>
                      )}
                    </span>
                  </span>

                  {/* Les cinq totaux du groupe, dans l'ordre des colonnes du
                      tableau (21/08/2026) : BU → PDC → Estimation →
                      Engagement → Factures. Les trois premiers s'effacent sur
                      les écrans étroits — l'engagement, lui, reste toujours
                      lisible : c'est le chiffre qui sert au tri par défaut. */}
                  <span className="text-right shrink-0 hidden xl:block">
                    <span className="block text-xs text-gray-400">BU initial</span>
                    <span className="block text-sm text-gray-600 tabular-nums">{montant(groupe.bu, 'KUSD')}</span>
                  </span>

                  <span className="text-right shrink-0 hidden xl:block">
                    <span className="block text-xs text-gray-400">PDC</span>
                    <span className="block text-sm text-gray-600 tabular-nums">{montant(groupe.pdc, 'KUSD')}</span>
                  </span>

                  <span className="text-right shrink-0 hidden lg:block">
                    <span className="block text-xs text-gray-400">Estimation</span>
                    <span className="block text-sm text-gray-600 tabular-nums">
                      {montant(groupe.estimation, 'KUSD')}
                    </span>
                  </span>

                  <span className="text-right shrink-0">
                    <span className="block text-xs text-gray-400">Engagement</span>
                    <span className="block text-sm font-semibold text-gray-900 tabular-nums">
                      {montant(groupe.engagement, 'KUSD')}
                    </span>
                  </span>

                  <span className="text-right shrink-0 hidden sm:block">
                    <span className="block text-xs text-gray-400">Facturé</span>
                    <span className="block text-sm text-gray-600 tabular-nums">{montant(groupe.facture, 'KUSD')}</span>
                  </span>

                  <span className="shrink-0 w-32 text-right">
                    <span className="block text-xs text-gray-400">Avancement moyen</span>
                    {/* `null` et non 0 % : un groupe dont aucun projet n'a
                        d'avancement renseigné n'est pas un groupe en retard —
                        `BarreProgression` affiche alors un tiret. */}
                    <BarreProgression valeur={groupe.avancementMoyen} />
                  </span>
                </button>

                {deplie && (
                  <ul className="bg-gray-50/60 divide-y divide-gray-100">
                    {groupe.lignes.map((ligne) => (
                      <li key={ligne.p.id}>
                        <button
                          type="button"
                          onClick={() => onOuvrirProjet(ligne.p)}
                          className="w-full px-5 py-2 pl-12 flex flex-wrap items-center gap-x-4 gap-y-1 text-left hover:bg-white transition"
                          title="Voir le détail du projet"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{ligne.p.projet}</span>
                          {ligne.p.serviceLeader && (
                            <span className="text-xs text-gray-400 shrink-0">{ligne.p.serviceLeader}</span>
                          )}
                          <span className="text-xs text-gray-600 tabular-nums shrink-0 w-28 text-right">
                            {montant(ligne.engagementKusd ?? ligne.p.montantPO, 'KUSD')}
                          </span>
                          <span className="text-xs text-gray-500 tabular-nums shrink-0 w-12 text-right">
                            {/* Même règle que partout : une absence reste une
                                absence, elle ne devient pas 0 %. */}
                            {avancementDe(ligne) != null ? formatPercent((avancementDe(ligne) as number) / 100, 0) : '—'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          {groupes.length > 0 && (
            <p className="px-5 py-3 text-xs text-gray-400">
              Montants en {uniteAffichee('KUSD')}. L'engagement reprend la règle du tableau : le montant calculé s'il
              existe, sinon celui du PO.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
