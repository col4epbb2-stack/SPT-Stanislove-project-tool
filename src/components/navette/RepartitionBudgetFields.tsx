import { ChampMontant } from '../ui/ChampMontant'
import { useMontant } from '../../lib/montantAffiche'
import { uniteMontant } from '../../types/devise'
import { montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import type { Devise } from '../../types/project'
import type { RepartitionBudgetState } from './useRepartitionBudget'

// Les montants d'une ligne navette sont comptés en milliers de sa devise
// (colonnes « K… » du classeur) : `ChampMontant` reprend cette unité et laisse
// saisir dans une autre devise, qu'il convertit avant enregistrement
// (18/08/2026, référentiel des devises).

interface RepartitionBudgetFieldsProps extends RepartitionBudgetState {
  devise: Devise
  montantLabel?: string
  // Utilisé par ArbitrageModal : le montant n'est plus saisi directement ici
  // mais dérivé d'un gap saisi ailleurs — champ affiché mais non éditable.
  montantDisabled?: boolean
}

export function RepartitionBudgetFields({
  devise,
  montantLabel,
  montantDisabled,
  budgetInitial,
  setBudgetInitial,
  budgetTotal,
  conso,
  setConso,
  serv,
  setServ,
  log,
  setLog,
  pers,
  setPers,
  autres,
  setAutres,
  sommeRepartie,
  ecart,
  repartitionValide,
}: RepartitionBudgetFieldsProps) {
  const { montant: formatMontant } = useMontant()
  // Unité d'enregistrement de la ligne : les montants de ce formulaire sont
  // comptés en milliers de SA devise (colonnes « K… » du classeur).
  const unite = uniteMontant(devise, 'millier')

  return (
    <div>
      <ChampMontant
        label={montantLabel ?? 'Budget initial (BU)'}
        devise={devise}
        echelle="millier"
        min={0}
        value={montantDepuisTexte(budgetInitial)}
        onChange={(v) => setBudgetInitial(texteDepuisMontant(v))}
        disabled={montantDisabled}
        required
      />

      {budgetTotal <= 0 ? (
        <p className="text-sm text-gray-400 mt-4">
          Saisissez le montant pour renseigner la répartition.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-500 mt-4 mb-1.5">Répartition par section</p>
          <div className="grid grid-cols-5 gap-2">
            {(
              [
                ['CONSO', conso, setConso],
                ['SERV', serv, setServ],
                ['LOG', log, setLog],
                ['PERS', pers, setPers],
                ['AUTRES', autres, setAutres],
              ] as const
            ).map(([libelle, valeur, setValeur]) => (
              <ChampMontant
                key={libelle}
                label={libelle}
                devise={devise}
                echelle="millier"
                value={montantDepuisTexte(valeur)}
                onChange={(v) => setValeur(texteDepuisMontant(v))}
              />
            ))}
          </div>

          <div
            className={`flex items-center gap-2 text-sm mt-3 px-3 py-2 rounded-lg ${
              repartitionValide ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}
          >
            <span>{repartitionValide ? '✓' : '⚠'}</span>
            {/* Ces montants sont comptés dans l'unité d'enregistrement de la
                ligne, mais s'affichent dans la devise du système — comme les
                six champs juste au-dessus, qui se saisissent déjà dans
                celle-ci. Ils étaient rendus bruts avec « K{devise} » écrit à
                la main : la ligne de contrôle contredisait donc les champs
                qu'elle contrôle dès que la ligne n'était pas dans la devise du
                système (21/08/2026). */}
            <span>
              Total réparti : {formatMontant(Math.round(sommeRepartie * 100) / 100, unite)} /{' '}
              {formatMontant(budgetTotal, unite)}
              {repartitionValide
                ? ' — conforme au budget initial'
                : ecart > 0
                  ? ` — dépassement de ${formatMontant(ecart, unite)}`
                  : ` — manque ${formatMontant(Math.abs(ecart), unite)}`}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
