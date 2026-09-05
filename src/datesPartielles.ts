/**
 * Dates à précision variable (`doc/module contrat_rev01.docx` §3).
 *
 * « L'outil ne sera pas connecté à l'API SAP et ne disposera donc pas
 * systématiquement des dates exactes de validation. Par conséquent, la saisie
 * des dates ne doit pas être bloquante. Exemples autorisés : Jour + mois +
 * année ou Mois + année uniquement. »
 *
 * **La précision n'est pas un second champ**, elle se lit dans la valeur :
 * `2026-03-17` est une date au jour, `2026-03` une date au mois. Un drapeau
 * séparé serait une donnée de plus à tenir d'accord avec la valeur, et les
 * deux finiraient par diverger. Le précédent d'affichage existe déjà dans
 * l'application (`formatDateOuTexte`, lib/format.ts, pour les dates saisies
 * en texte des classeurs Procurement).
 *
 * **Ce qui n'est pas décidé ici** : sur quel jour du mois compter un délai
 * quand seule la précision au mois est connue. Le document ne le dit pas
 * (question Q5 du recueil), et le supposer — 1ᵉʳ, 15, dernier jour — inventerait
 * un écart de trente jours sur le KPI principal du §3. `ecartJours` rend donc
 * `null` dans ce cas, et `raisonEcartAbsent` permet à l'écran de dire
 * *pourquoi* le délai est vide plutôt que de laisser croire à une donnée
 * manquante.
 */

export type PrecisionDate = 'jour' | 'mois'

const AU_JOUR = /^\d{4}-\d{2}-\d{2}$/
const AU_MOIS = /^\d{4}-\d{2}$/

/** Précision d'une date, `null` si la valeur est vide ou d'une autre forme. */
export function precisionDate(valeur?: string | null): PrecisionDate | null {
  if (!valeur) return null
  if (AU_JOUR.test(valeur)) return 'jour'
  if (AU_MOIS.test(valeur)) return 'mois'
  return null
}

/** La date est-elle renseignée, quelle que soit sa précision ? */
export function estRenseignee(valeur?: string | null): boolean {
  return precisionDate(valeur) !== null
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/**
 * Affichage d'une date à précision variable : `17/03/2026` au jour,
 * `mars 2026` au mois.
 *
 * Une valeur d'une autre forme est rendue **telle quelle** plutôt que
 * remplacée par « Invalid Date » — c'est ce que fait déjà `formatDateOuTexte`
 * pour les dates en texte des classeurs importés.
 */
export function formatDatePartielle(valeur?: string | null, rien = '—'): string {
  const precision = precisionDate(valeur)
  if (!precision) return valeur && valeur.trim() !== '' ? valeur : rien
  const [annee, mois, jour] = (valeur as string).split('-')
  if (precision === 'mois') return `${MOIS[Number(mois) - 1] ?? mois} ${annee}`
  return `${jour}/${mois}/${annee}`
}

/** Le mois d'une date, quelle que soit sa précision (`2026-03`). */
export function moisDe(valeur?: string | null): string | null {
  const precision = precisionDate(valeur)
  if (!precision) return null
  return (valeur as string).slice(0, 7)
}

/**
 * Écart en jours entre deux dates, `null` dès qu'il n'est pas calculable.
 *
 * Deux cas rendent `null`, et ils ne veulent pas dire la même chose — d'où
 * `raisonEcartAbsent` : une borne **absente**, ou une borne connue **au mois
 * près** seulement. Dans les deux cas, un délai inconnu n'est pas un délai
 * nul : rendre `0` tirerait toutes les moyennes vers le bas sans que rien ne
 * le dise.
 */
export function ecartJours(debut?: string | null, fin?: string | null): number | null {
  if (precisionDate(debut) !== 'jour' || precisionDate(fin) !== 'jour') return null
  const d = new Date(debut as string).getTime()
  const f = new Date(fin as string).getTime()
  if (Number.isNaN(d) || Number.isNaN(f)) return null
  return Math.round((f - d) / 86_400_000)
}

export type RaisonEcartAbsent = 'bornes' | 'precision'

/**
 * Pourquoi un écart n'est pas calculé — `null` quand il l'est.
 *
 * - `'bornes'` : au moins une des deux dates n'est pas renseignée ;
 * - `'precision'` : les deux sont renseignées, mais l'une au moins n'est
 *   connue qu'au mois. Le document autorise cette saisie (§3) sans dire sur
 *   quel jour compter — on l'affiche au lieu de trancher à sa place.
 */
export function raisonEcartAbsent(debut?: string | null, fin?: string | null): RaisonEcartAbsent | null {
  const pd = precisionDate(debut)
  const pf = precisionDate(fin)
  if (pd === null || pf === null) return 'bornes'
  if (pd === 'mois' || pf === 'mois') return 'precision'
  return null
}

export const LIBELLE_RAISON_ECART: Record<RaisonEcartAbsent, string> = {
  bornes: 'une des deux dates n’est pas renseignée',
  precision: 'une date connue au mois près ne permet pas de compter des jours',
}
