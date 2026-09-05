import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/useAuth'
import { useNavette } from '../../contexts/useNavette'
import type { ArbitrageNavette, CycleBudgetId, LigneNavette } from '../../types/navette'
import {
  CASCADE_CYCLES,
  CYCLE_BUDGET_LABELS,
  SUCCESSEUR_ARBITRAGE,
  cyclesACascader,
  gapPropose,
  tauxPour,
  totalBudget,
} from '../../types/navette'
import { useRepartitionBudget } from './useRepartitionBudget'
import { RepartitionBudgetFields } from './RepartitionBudgetFields'
import { ChampMontant } from '../ui/ChampMontant'
import { montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { useDevises } from '../../contexts/useDevises'
import { uniteMontant } from '../../types/devise'
import { useMontant } from '../../lib/montantAffiche'

interface ArbitrageModalProps {
  ligne: LigneNavette
  cycleId: CycleBudgetId
  isOpen: boolean
  onClose: () => void
  // Révision admin appliquée immédiatement (pas d'étape de validation), pour
  // corriger un cycle déjà validé ou hors de sa fenêtre normale — cf.
  // NavetteLigneDetailModal.
  correctif?: boolean
  // Réajustement d'une proposition **encore en attente** (23/08/2026, demande
  // explicite) : le même formulaire, prérempli avec ce qui a été proposé, qui
  // corrige la révision au lieu d'en créer une seconde. Le cycle et le
  // demandeur ne bougent pas.
  arbitrageAAjuster?: ArbitrageNavette
}

const REPARTITION_NULLE = { conso: 0, serv: 0, log: 0, pers: 0, autres: 0 }

// Reprend le principe directeur de docs/navette.md pour une révision
// trimestrielle : au lieu de ressaisir un montant total, on saisit un gap
// (écart, positif ou négatif) qui s'ajoute au montant de base — chargé
// directement depuis le total du cycle PDC choisi (ligne.cycles[cycleId] ;
// déjà à jour grâce à la propagation en cascade des révisions précédentes,
// cf. NavetteContext.viserArbitrage) — puis on répartit ce nouveau total
// via useRepartitionBudget/RepartitionBudgetFields, exactement comme à la
// création.
//
// Si le gap rend le total théorique négatif (déficit), le total effectif de
// la ligne est plafonné à 0 et le manquant est prélevé sur la cale (réserve
// globale, totalement indépendante du CP) — débité réellement seulement à
// la validation finale (visa du directeur technique), jamais à la proposition (cf.
// NavetteContext.viserArbitrage).
export function ArbitrageModal({
  ligne,
  cycleId,
  isOpen,
  onClose,
  correctif = false,
  arbitrageAAjuster,
}: ArbitrageModalProps) {
  const { currentUser } = useAuth()
  const { proposerArbitrage, reviserCorrectif, ajusterArbitrage, caleDisponible, tauxChange } = useNavette()
  const { pivot } = useDevises()
  const { montant: formatMontant } = useMontant()
  const budget = useRepartitionBudget()
  // En réajustement, le formulaire rouvre sur l'écart déjà proposé — calculé
  // ici plutôt que posé par un effet : un `setState` dans un effet déclenche
  // un rendu en cascade (règle `react-hooks/set-state-in-effect`), et la
  // valeur est connue dès le premier rendu, la modale n'étant montée qu'à
  // l'ouverture.
  const [gap, setGap] = useState(() =>
    arbitrageAAjuster
      ? String(
          gapPropose(
            arbitrageAAjuster,
            totalBudget(ligne.cycles[cycleId]),
            tauxPour(ligne.devise, tauxChange)
          )
        )
      : '0'
  )
  const [erreur, setErreur] = useState<string | null>(null)

  // Le "budget actuel" affiché est celui du cycle précédent dans la cascade
  // (BU pour PDC02, PDC02 pour PDC05, etc.) — nommé explicitement pour que
  // l'origine du montant soit intuitive, pas juste "le montant du cycle en
  // cours" (cf. retour utilisateur : intitulés importants).
  const indexCascade = CASCADE_CYCLES.indexOf(cycleId)
  const cyclePrecedent = indexCascade <= 0 ? 'BU' : CASCADE_CYCLES[indexCascade - 1]

  // Cycles suivants (n+1, n+2…) que cette révision écrasera aussi (04/09/2026,
  // demande explicite « tenir compte n-1 et n+1 dans la modification ») : la
  // cascade avance tant qu'un cycle suivant porte encore exactement la valeur
  // qu'on révise, et s'arrête au premier qui a déjà sa propre révision — cf.
  // `cyclesACascader`. Une révision pouvant désormais arriver à tout moment
  // (et non plus dans l'ordre chronologique des fenêtres), ce n'est plus
  // garanti d'avance : on l'affiche pour que ce soit visible avant d'enregistrer.
  const cyclesCascade = cyclesACascader(ligne.cycles, cycleId)
  const cyclesSuivantsEcrases = cyclesCascade.slice(1)
  const successeur = SUCCESSEUR_ARBITRAGE[cycleId]
  const successeurDejaRevise = !!successeur && cyclesSuivantsEcrases.length === 0

  const montantBase = totalBudget(ligne.cycles[cycleId])
  const gapNum = Number(gap) || 0
  const totalTheorique = montantBase + gapNum
  const deficit = totalTheorique < 0 ? Math.round(Math.abs(totalTheorique) * 100) / 100 : 0
  const totalEffectif = Math.max(0, totalTheorique)
  // La cale est toujours en USD — le déficit (dans la devise de la ligne)
  // doit être converti avant comparaison/prélèvement (CDS §5).
  const facteurDevise = tauxPour(ligne.devise, tauxChange)
  // Le déficit dans la devise pivot : c'est en pivot que la cale est comptée,
  // et c'est aussi la devise du système, donc celle qu'affichent tous les
  // écrans (19/08/2026). L'unité suit le pivot au lieu d'être écrite « KUSD ».
  const deficitPivot = Math.round(deficit * facteurDevise * 100) / 100
  const unitePivot = uniteMontant(pivot.code, 'millier')
  // Unité d'enregistrement de la ligne — ce que valent les nombres lus dans
  // `ligne.cycles`. `formatMontant` (useMontant) les convertit vers la devise
  // du système avant de les afficher, comme partout ailleurs sur cet écran.
  const uniteLigne = uniteMontant(ligne.devise, 'millier')
  const caleInsuffisante = deficit > 0 && (caleDisponible ?? 0) < deficitPivot

  // Initialise le total (base + gap 0) et la répartition avec la
  // ventilation actuelle du cycle dès l'ouverture — sans ça, une révision à
  // gap nul (ex. correctif, ou simple test) forçait à ressaisir la
  // ventilation complète pour que la somme corresponde, ce qui bloquait le
  // bouton "Proposer la révision" sans que la raison soit évidente.
  useEffect(() => {
    // En réajustement, ce qui est prérempli est **la proposition**, pas le
    // cycle : c'est elle qu'on vient corriger (l'écart, lui, est reconstitué à
    // l'initialisation de `gap` ci-dessus).
    const periode = arbitrageAAjuster?.repartition ?? ligne.cycles[cycleId]
    budget.setBudgetInitial(String(arbitrageAAjuster ? arbitrageAAjuster.montant : montantBase))
    budget.setConso(String(periode.conso))
    budget.setServ(String(periode.serv))
    budget.setLog(String(periode.log))
    budget.setPers(String(periode.pers))
    budget.setAutres(String(periode.autres))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGapChange = (value: string) => {
    setGap(value)
    const nouveauTotal = montantBase + (Number(value) || 0)
    budget.setBudgetInitial(String(Math.max(0, nouveauTotal)))
  }

  const resetAndClose = () => {
    budget.reset()
    setGap('0')
    setErreur(null)
    onClose()
  }

  // En déficit total (totalEffectif à 0), il n'y a plus rien à répartir —
  // budget.repartitionValide reste toujours faux dans ce cas (son
  // budgetTotal > 0 interne l'exclut), donc la validité se recalcule ici.
  const revisionValide = deficit > 0 ? totalEffectif === 0 && !caleInsuffisante : budget.repartitionValide

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    if (!revisionValide) return

    setErreur(null)
    try {
      const input = {
        ligneId: ligne.id,
        cycleId,
        montant: totalEffectif,
        repartition: deficit > 0 && totalEffectif === 0 ? REPARTITION_NULLE : budget.repartition,
        demandeurId: currentUser.id,
        // Firestore rejette les champs à `undefined` (setDoc) — on n'inclut
        // la clé que si un prélèvement a réellement lieu. Toujours en USD
        // (converti), car c'est ce qui est réellement décompté de la cale.
        ...(deficit > 0 ? { montantPreleveCale: deficitPivot } : {}),
      }
      if (arbitrageAAjuster) {
        await ajusterArbitrage(arbitrageAAjuster.id, {
          montant: input.montant,
          repartition: input.repartition,
          montantPreleveCale: deficit > 0 ? deficitPivot : undefined,
        })
      } else if (correctif) {
        await reviserCorrectif(input, currentUser.id)
      } else {
        await proposerArbitrage(input)
      }
      resetAndClose()
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : arbitrageAAjuster
            ? 'Impossible de réajuster cette révision.'
            : 'Impossible de proposer cette révision.'
      )
    }
  }

  // `CYCLE_BUDGET_LABELS` dit déjà « Révision PDC05 » : le préfixe « Réviser »
  // donnait « Réviser Révision PDC05 » (retour utilisateur du 21/08/2026). Le
  // correctif garde le sien, c'est un autre geste que la révision ordinaire.
  const prefixe = arbitrageAAjuster ? 'Réajuster — ' : correctif ? 'Correctif — ' : ''
  const titre = `${prefixe}${CYCLE_BUDGET_LABELS[cycleId]} — ${ligne.libelle}`

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={titre}
      maxWidth="max-w-5xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            {/* Affiché dans la devise du système, comme le champ « Arbitrage »
                juste à côté (ChampMontant fait déjà saisir dans celle-ci).
                Le libellé portait « en K{ligne.devise} » et le montant était
                rendu brut : les deux moitiés de cette rangée annonçaient donc
                deux devises différentes dès que la ligne n'était pas dans
                celle du système (21/08/2026). */}
            <label className="block text-sm font-medium text-gray-500 mb-1.5">
              Budget actuel ({cyclePrecedent})
            </label>
            <div className="px-4 py-3 rounded-xl border text-base bg-gray-100 border-gray-200 text-gray-700 tabular-nums">
              {formatMontant(montantBase, uniteLigne)}
            </div>
          </div>
          {/* Un arbitrage est un écart, positif ou négatif — pas de `min`
              ici. Comme tout montant, il peut se saisir dans une autre devise
              que celle de la ligne (référentiel des devises, 18/08/2026). */}
          <ChampMontant
            label="Arbitrage"
            devise={ligne.devise}
            echelle="millier"
            value={montantDepuisTexte(gap)}
            onChange={(v) => handleGapChange(texteDepuisMontant(v))}
          />
        </div>

        {deficit > 0 && (
          <div className={`text-sm px-3 py-2 rounded-lg ${caleInsuffisante ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
            {/* La cale est comptée dans le pivot, qui est aussi la devise du
                système : ces montants y sont déjà. Ils étaient rendus bruts
                (« 40000 KUSD ») là où le reste de l'écran les met en forme —
                d'où `formatMontant`, à qui on donne l'unité pivot puisque
                c'est déjà celle des valeurs. */}
            {caleInsuffisante ? (
              <>
                ⚠ Cale insuffisante pour couvrir ce déficit (manque{' '}
                {formatMontant(Math.round((deficitPivot - (caleDisponible ?? 0)) * 100) / 100, unitePivot)})
              </>
            ) : (
              <>
                ⚠ Déficit de {formatMontant(deficitPivot, unitePivot)}
                {/* La ligne, elle, s'enregistre dans SA devise : le dire
                    explicitement est le seul endroit de l'écran où l'unité de
                    stockage doit rester visible. */}
                {ligne.devise !== pivot.code && <> (ligne enregistrée en {uniteLigne} : {deficit})</>}{' '}
                — couvert par la cale (disponible : {formatMontant(caleDisponible ?? 0, unitePivot)})
              </>
            )}
          </div>
        )}

        {/* Effet de la cascade sur les cycles suivants (n+1…), affiché avant
            l'enregistrement — une révision pouvant désormais arriver à tout
            moment, ce que la cascade va toucher n'est plus prévisible d'avance
            (04/09/2026, demande explicite). */}
        {cyclesSuivantsEcrases.length > 0 && (
          <p className="text-xs px-3 py-2 rounded-lg bg-blue-50 text-blue-700">
            S'appliquera aussi à {cyclesSuivantsEcrases.map((c) => CYCLE_BUDGET_LABELS[c]).join(', ')}, tant qu'ils
            n'ont pas leur propre révision.
          </p>
        )}
        {successeurDejaRevise && successeur && (
          <p className="text-xs px-3 py-2 rounded-lg bg-gray-50 text-gray-600">
            {CYCLE_BUDGET_LABELS[successeur]} porte déjà sa propre révision et ne sera pas modifié par celle-ci.
          </p>
        )}

        <RepartitionBudgetFields
          {...budget}
          devise={ligne.devise}
          // Base et écart affichés dans la devise du système, comme les deux
          // champs du haut : le libellé les rendait bruts, donc dans la devise
          // de la ligne, à côté d'un champ libellé dans celle du système.
          montantLabel={`Nouveau montant ${cycleId} (${formatMontant(montantBase, uniteLigne)} ${
            gapNum < 0 ? '−' : '+'
          } ${formatMontant(Math.abs(gapNum), uniteLigne)})`}
          montantDisabled
        />

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        {/* Le visa déjà posé portait sur le montant d'avant : le dire avant
            l'enregistrement, pas après (cf. `parcoursApresAjustement`). */}
        {arbitrageAAjuster?.visaChefDepartement && (
          <p className="text-sm px-3 py-2 rounded-lg bg-amber-50 text-amber-800">
            Le visa du chef de département sera retiré et la révision repartira à la première étape : il portait sur
            le montant précédent.
          </p>
        )}

        <p className="text-xs text-gray-500">
          {arbitrageAAjuster
            ? "Cette proposition sera corrigée sur place — elle reste en attente de validation, aucun budget n'est encore modifié."
            : correctif
              ? "Cette révision sera appliquée immédiatement (correctif administrateur)."
              : "Cette révision sera soumise au visa du chef de département, puis à celui du directeur technique — c'est ce second visa qui l'applique à la ligne."}
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={resetAndClose}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={!revisionValide}>
            {arbitrageAAjuster
              ? 'Enregistrer le réajustement'
              : correctif
                ? 'Appliquer le correctif'
                : 'Proposer la révision'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
