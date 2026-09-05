import { useState } from 'react'
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Coins,
  Gavel,
  PiggyBank,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { TuileKpi } from '../ui/TuileKpi'
import { TONS_KPI, type TonKpi } from '../ui/tonsKpi'
import { useDevises } from '../../contexts/useDevises'
import { FACTEUR_ECHELLE, formaterTaux, formaterValeurTaux, uniteMontant } from '../../types/devise'
import {
  CYCLES_ARBITRABLES,
  CYCLE_BUDGET_LABELS,
  REFERENCES_CP,
  TAUX_CHANGE_DEFAUT,
  type CycleBudgetId,
} from '../../types/navette'
import { useMontant } from '../../lib/montantAffiche'

// Présentation des indicateurs de pilotage de la navette (CP, cale,
// arbitrages, taux de change). Ces valeurs vivaient jusqu'ici en petit texte
// gris au bout de la barre de filtres et en simple liste de lignes
// libellé/valeur — illisibles alors que ce sont les chiffres qu'on vient
// chercher en premier sur cet écran.

// Le taux d'absorption mesure ce qui a déjà été pioché dans la réserve :
// plus il monte, moins il reste de marge pour le prochain arbitrage — d'où
// l'ambre puis le rouge, et non l'inverse.
function tonAbsorption(taux: number): TonKpi {
  if (taux >= 0.85) return 'red'
  if (taux >= 0.6) return 'amber'
  return 'primary'
}

// Le bandeau répond à deux questions différentes, d'où deux rangées plutôt
// qu'une grille de sept tuiles (retour utilisateur du 21/08/2026 : « organiser
// l'affichage pour que ça passe à l'œil ») : ce que pèse le portefeuille
// **filtré** d'abord, l'état de la cale ensuite — qui est global et ne bouge
// pas avec les filtres.
export function BandeauKpiNavette({
  cpTotal,
  referenceCp,
  onReferenceCpChange,
  lignesAvecCp,
  totalBU,
  totalPdc,
  cyclePdc,
  onCyclePdcChange,
  lignesAvecPdc,
  lignesFiltrees,
  caleInitiale,
  caleDisponible,
  arbitragesRealises,
  tauxAbsorption,
  arbitragesEnAttente,
}: {
  cpTotal: number
  /**
   * Version de référence du CP (23/08/2026) : BU initial ou l'une des 4
   * révisions PDC. Le CP n'est plus calculé sur « la révision actuelle »,
   * choisie automatiquement — il l'était pendant qu'on pouvait consulter un
   * autre cycle dans le tableau, ce que la demande vient corriger.
   */
  referenceCp: CycleBudgetId
  onReferenceCpChange: (cycle: CycleBudgetId) => void
  /** Lignes filtrées portant un CP non nul sur cette version. */
  lignesAvecCp: number
  /** Cumul du cycle « Budget initial (BU) » sur les lignes filtrées. */
  totalBU: number
  /** Cumul du cycle PDC choisi ci-dessous, sur les mêmes lignes. */
  totalPdc: number
  cyclePdc: CycleBudgetId
  onCyclePdcChange: (cycle: CycleBudgetId) => void
  /** Lignes filtrées dont ce cycle porte un montant — un cumul à 0 se lit mal sans ça. */
  lignesAvecPdc: number
  lignesFiltrees: number
  caleInitiale: number | null
  caleDisponible: number | null
  arbitragesRealises: number
  tauxAbsorption: number
  arbitragesEnAttente: number
}) {
  const { montant: formatMontant } = useMontant()
  const { pivot } = useDevises()
  const unite = uniteMontant(pivot.code, 'millier')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      <TuileKpi
          libelle="Total BU initial"
          valeur={formatMontant(totalBU, unite)}
          detail="Cycle Budget initial (BU), avant toute révision"
          icone={<Banknote className="w-5 h-5" />}
          ton="accent"
        />
         <TuileKpi
          libelle={
            <span className="inline-flex items-center gap-1.5">
              Total
              <select
                value={cyclePdc}
                onChange={(e) => onCyclePdcChange(e.target.value as CycleBudgetId)}
                aria-label="Cycle PDC affiché"
                className="bg-transparent text-xs font-semibold text-gray-700 border-b border-dashed border-gray-300 hover:border-gray-400 focus:border-primary focus:outline-none cursor-pointer"
              >
                {CYCLES_ARBITRABLES.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {CYCLE_BUDGET_LABELS[cycle]}
                  </option>
                ))}
              </select>
            </span>
          }
          valeur={formatMontant(totalPdc, unite)}
          detail={`${lignesAvecPdc} / ${lignesFiltrees} lignes portent un montant sur ce cycle`}
          icone={<RefreshCw className="w-5 h-5" />}
          ton="primary"
        />
        {/* Le CP (= SERV + CONSO) porte sa version de référence dans son
            libellé, comme la tuile PDC porte son cycle : c'est là que se pose
            la question « à partir de quel référentiel ? », et l'y répondre
            évite qu'un CP calculé sur une révision soit lu à côté d'un BU. */}
        <TuileKpi
          libelle={
            <span className="inline-flex items-center gap-1.5">
              CP total —
              <select
                value={referenceCp}
                onChange={(e) => onReferenceCpChange(e.target.value as CycleBudgetId)}
                aria-label="Version de référence du CP"
                className="bg-transparent text-xs font-semibold text-gray-700 border-b border-dashed border-gray-300 hover:border-gray-400 focus:border-primary focus:outline-none cursor-pointer"
              >
                {REFERENCES_CP.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {CYCLE_BUDGET_LABELS[cycle]}
                  </option>
                ))}
              </select>
            </span>
          }
          valeur={formatMontant(cpTotal, unite)}
          detail={`SERV + CONSO · ${lignesAvecCp} / ${lignesFiltrees} lignes portent un CP sur ce cycle`}
          icone={<Wallet className="w-5 h-5" />}
        />
        
       
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <TuileKpi
          libelle="Cale à absorber"
          valeur={caleInitiale !== null ? formatMontant(caleInitiale, unite) : '—'}
          detail={caleInitiale !== null ? 'Référence fixée par un admin' : 'Non définie par un admin'}
          icone={<PiggyBank className="w-5 h-5" />}
          ton={caleInitiale !== null ? 'accent' : 'gray'}
        />
        <TuileKpi
          libelle="Arbitrages réalisés"
          valeur={formatMontant(arbitragesRealises, unite)}
          detail={caleInitiale ? `${Math.round(tauxAbsorption * 100)} % de la cale absorbés` : 'Cale non définie'}
          icone={<ArrowLeftRight className="w-5 h-5" />}
          ton={tonAbsorption(tauxAbsorption)}
          progression={tauxAbsorption}
        />
        <TuileKpi
          libelle="Arbitrages en attente"
          valeur={String(arbitragesEnAttente)}
          detail={arbitragesEnAttente > 0 ? 'À valider ou rejeter' : 'Rien à traiter'}
          icone={<Gavel className="w-5 h-5" />}
          ton={arbitragesEnAttente > 0 ? 'amber' : 'gray'}
        />
        {/* Promue en tuile de plein droit (21/08/2026) : c'est le chiffre que
            l'utilisateur vient chercher — cale à absorber − arbitrages — et il
            ne se lisait qu'en petit texte de détail sous la cale. */}
        <TuileKpi
          libelle="Reste de la cale à absorber"
          valeur={caleInitiale !== null ? formatMontant(caleDisponible ?? 0, unite) : '—'}
          detail={caleInitiale !== null ? 'Cale à absorber − arbitrages réalisés' : 'Cale non définie'}
          icone={<CircleDollarSign className="w-5 h-5" />}
          ton={caleInitiale === null ? 'gray' : (caleDisponible ?? 0) <= 0 ? 'red' : 'primary'}
        />
        
      </div>
    </div>
  )
}

// Champ montant admin : gros chiffre éditable au lieu d'un <input> de
// formulaire, pour que la carte reste lisible en mode lecture comme en
// mode saisie. `null` = pas en cours d'édition, on affiche la valeur du
// contexte (même convention que les autres brouillons de la page).
function MontantEditable({
  valeur,
  editable,
  onValider,
}: {
  valeur: number | null
  editable: boolean
  onValider: (v: number) => void
}) {
  const { montant: formatMontant, uniteAffichee, uniteSysteme } = useMontant()
  // La cale est **enregistrée** en milliers de pivot ; elle se lit et se tape
  // à l'unité comme tout le reste depuis le 21/08/2026. Ce champ n'est pas un
  // `ChampMontant` (c'est un gros chiffre éditable en place, pas un champ de
  // formulaire) : la mise à l'échelle est donc faite ici, à la main, dans les
  // deux sens — exacte, sans taux, `FACTEUR_ECHELLE` en est le seul facteur.
  const uniteStockage = uniteSysteme()
  const uniteSaisie = uniteAffichee(uniteStockage)
  const [draft, setDraft] = useState<string | null>(null)

  if (!editable) {
    return <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatMontant(valeur ?? 0, uniteStockage)}</p>
  }

  const affiche = valeur !== null ? String(valeur * FACTEUR_ECHELLE.millier) : ''

  return (
    <div className="flex items-baseline gap-1.5">
      <input
        type="number"
        value={draft ?? affiche}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== '') onValider((Number(draft) || 0) / FACTEUR_ECHELLE.millier)
          setDraft(null)
        }}
        placeholder="0"
        className="w-44 bg-transparent text-2xl font-bold text-gray-900 tabular-nums border-b-2 border-dashed border-gray-200 hover:border-gray-300 focus:border-primary focus:outline-none"
      />
      <span className="text-xs font-semibold text-gray-400">{uniteSaisie}</span>
    </div>
  )
}

export function CartePilotageCale({
  caleInitiale,
  caleDisponible,
  arbitragesRealises,
  tauxAbsorption,
  isAdmin,
  onDefinirCaleInitiale,
  onDefinirCale,
}: {
  caleInitiale: number | null
  caleDisponible: number | null
  arbitragesRealises: number
  tauxAbsorption: number
  isAdmin: boolean
  onDefinirCaleInitiale: (v: number) => void
  onDefinirCale: (v: number) => void
}) {
  const { montant: formatMontant } = useMontant()
  const { pivot } = useDevises()
  const unite = uniteMontant(pivot.code, 'millier')
  const ton = TONS_KPI[tonAbsorption(tauxAbsorption)]
  const pourcent = Math.round(tauxAbsorption * 100)

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 bg-linear-to-br from-primary/5 to-accent/5 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">Pilotage de la cale</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
            Réserve globale, indépendante du CP, dans laquelle on pioche pour combler un déficit lors d'une
            révision. Le reste se décrémente tout seul à chaque arbitrage validé.
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-sm font-bold tabular-nums ${ton.fond} ${ton.texte}`}>
          {caleInitiale ? `${pourcent} %` : '—'}
          <span className="ml-1.5 text-xs font-medium opacity-80">absorbés</span>
        </span>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Cale à absorber</p>
            <MontantEditable valeur={caleInitiale} editable={isAdmin} onValider={onDefinirCaleInitiale} />
            <p className="text-xs text-gray-400 mt-1">Référence fixée par un admin</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Arbitrages réalisés</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {formatMontant(arbitragesRealises, unite)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Calculé : cale initiale − reste</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Reste à absorber</p>
            <MontantEditable valeur={caleDisponible} editable={isAdmin} onValider={onDefinirCale} />
            <p className="text-xs text-gray-400 mt-1">Décrémenté automatiquement</p>
          </div>
        </div>

        <div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${ton.barre}`}
              style={{ width: `${Math.min(100, Math.max(0, tauxAbsorption * 100))}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
            <span>Absorbé : {formatMontant(arbitragesRealises, unite)}</span>
            <span>Disponible : {formatMontant(caleDisponible ?? 0, unite)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export function CarteTauxChange({ onOuvrirDevises }: { onOuvrirDevises?: () => void }) {
  const { devises, pivot, referentielVierge } = useDevises()
  const autres = devises.filter((d) => !d.pivot && d.actif)

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Coins className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">Taux de change</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Pivot {pivot.code} — sert à agréger des lignes de devises différentes. Les taux se gèrent désormais dans
            l'écran Devises, commun à toute l'application.
          </p>
        </div>
        {onOuvrirDevises && (
          <button
            type="button"
            onClick={onOuvrirDevises}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Gérer
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {autres.map((devise) => (
          <div key={devise.code} className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-gray-900">1 {devise.code}</span>
              <span className="text-xs text-gray-400">= ? {pivot.code}</span>
            </div>
            {devise.taux === null ? (
              <p className="text-xl font-bold text-amber-600 tabular-nums">À définir</p>
            ) : (
              <>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{formaterValeurTaux(devise.taux)}</p>
                {/* Un taux inférieur à l'unité (le franc CFA, ~0,00183) se lit
                    mal dans ce sens : le sens inverse est celui que tout le
                    monde a en tête (1 USD = 546,6308 XAF). */}
                {devise.taux > 0 && devise.taux < 0.1 && (
                  <p className="text-xs text-gray-500 mt-1 tabular-nums">soit {formaterTaux(pivot.code, devise.code, devises)}</p>
                )}
              </>
            )}
            {devise.taux === null && (
              <p className="text-xs text-amber-600 mt-1.5">
                {/* Le repli n'est plus la parité neutre depuis que le
                    référentiel par défaut porte de vrais taux : c'est celui-là
                    qui s'applique, et il vaut mieux le nommer que laisser
                    croire à un 1 pour 1. */}
                {TAUX_CHANGE_DEFAUT[devise.code] == null
                  ? `Sans taux, ces lignes sont agrégées à parité neutre (1 ${devise.code} = 1 ${pivot.code}).`
                  : `Sans taux au référentiel, ces lignes sont agrégées au taux par défaut de l'application (${formaterValeurTaux(
                      TAUX_CHANGE_DEFAUT[devise.code]
                    )} ${pivot.code}).`}
              </p>
            )}
          </div>
        ))}
        {autres.length === 0 && (
          <p className="text-sm text-gray-500">Aucune autre devise que le pivot dans le référentiel.</p>
        )}
      </div>

      {referentielVierge && (
        <p className="px-5 pb-4 text-xs text-amber-600">
          Référentiel des devises non encore enregistré : ces valeurs sont celles par défaut.
        </p>
      )}
    </section>
  )
}
