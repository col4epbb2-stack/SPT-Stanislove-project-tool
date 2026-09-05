import type { CelluleGrille, KpiJournal } from '../types/grandArret'

// Colonnes calculées de la feuille « Journal » du classeur « Grand
// arret_suivi préfabrication_VF_1005 (1).xlsm » (07/08/2026, ouverture de la
// saisie du Journal).
//
// Le Journal est une grille brute (93 colonnes × 165 lignes, cf.
// types/grandArret.ts) : aucune ligne n'y porte de clé métier ni de champ
// nommé. Ce moteur travaille donc sur des index de colonnes 1-based, la
// numérotation du classeur — c'est le seul repère stable dont dispose ce
// module, et il rend les formules relisibles en face de la feuille Excel.
//
// TOUTES les formules ci-dessous ont été vérifiées sur les 165 lignes réelles
// avant d'être écrites, avec 0 écart sur les lignes comparables (même
// méthode que travauxMetalEngine / procurementFollowUpEngine). Les colonnes
// dont aucune formule reproductible n'a été trouvée dans les données restent
// en saisie manuelle — rien n'est inventé pour combler l'écart.

/** Colonnes du Journal citées par les formules (numérotation Excel, 1-based). */
export const COL_JOURNAL = {
  scope: 1,
  affaire: 2,
  plateforme: 3,
  entreprise: 4,
  livraisonCpy: 8,
  resteALivrer: 9,
  // Colonne que le classeur lui-même annonce comme à retirer
  // ("N° Soudure (COLONNE à SUPPRIMER)") : jamais proposée à la saisie, mais
  // sa valeur est conservée telle quelle sur les lignes importées.
  numeroSoudureObsolete: 14,
  poucesTotal: 49,
  poucesRealises: 50,
  avancementReelSoudage: 52,
} as const

/**
 * Les 5 phases du Journal qui suivent le même quatuor de colonnes
 * date début / durée d'exécution / date de fin / durée courue, plus leur
 * avancement prévisionnel. Le classeur duplique ce bloc pour chaque phase
 * (avec des libellés suffixés "2", "5", "22"… d'où l'illisibilité des
 * en-têtes bruts).
 */
export interface PhaseDureeJournal {
  nom: string
  debut: number
  dureeExecution: number
  fin: number
  dureeCourue: number
  avancementPrevisionnel: number
}

export const PHASES_DUREE_JOURNAL: PhaseDureeJournal[] = [
  { nom: 'PREPARATION ASSEMBLAGE', debut: 31, dureeExecution: 32, fin: 33, dureeCourue: 34, avancementPrevisionnel: 35 },
  { nom: 'SOUDAGE', debut: 42, dureeExecution: 43, fin: 44, dureeCourue: 45, avancementPrevisionnel: 51 },
  { nom: 'CND', debut: 59, dureeExecution: 60, fin: 61, dureeCourue: 62, avancementPrevisionnel: 68 },
  { nom: 'EPREUVE HYDRAULIQUE', debut: 72, dureeExecution: 73, fin: 74, dureeCourue: 75, avancementPrevisionnel: 76 },
  { nom: 'PEINTURE', debut: 85, dureeExecution: 86, fin: 87, dureeCourue: 88, avancementPrevisionnel: 89 },
]

const JOUR_MS = 86_400_000
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/

function cellule(lignes: CelluleGrille[], col: number): CelluleGrille {
  return lignes[col - 1] ?? null
}

function nombre(v: CelluleGrille): number | null {
  return typeof v === 'number' ? v : null
}

function jour(v: CelluleGrille): number | null {
  if (typeof v !== 'string' || !RE_ISO.test(v.slice(0, 10))) return null
  const t = Date.parse(`${v.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

function ratio(numerateur: CelluleGrille, denominateur: CelluleGrille): number | null {
  const n = nombre(numerateur)
  const d = nombre(denominateur)
  return n == null || !d ? null : n / d
}

/**
 * Durée d'exécution = date de fin − date de début, en jours.
 * Vérifié sur les 5 phases : 28 / 79 / 81 / 81 / 81 lignes comparables,
 * 0 écart.
 */
export function dureeExecution(cellules: CelluleGrille[], phase: PhaseDureeJournal): number | null {
  const debut = jour(cellule(cellules, phase.debut))
  const fin = jour(cellule(cellules, phase.fin))
  return debut == null || fin == null ? null : Math.round((fin - debut) / JOUR_MS)
}

/**
 * Durée courue = temps écoulé depuis le début, plafonné par la durée
 * d'exécution (une phase terminée ne court plus) et jamais négative.
 * Vérifié sur les 5 phases avec la date d'extraction du classeur
 * (10/05/2023, cohérente avec son nom « VF_1005 ») : 28 / 78 / 80 / 80 / 80
 * lignes comparables, 0 écart.
 *
 * Seule colonne dérivée qui dépend du jour où on la calcule : elle est donc
 * figée à la date d'enregistrement de la ligne, et les lignes importées
 * gardent la valeur du classeur (pas de recalcul rétroactif de l'historique).
 */
export function dureeCourue(
  cellules: CelluleGrille[],
  phase: PhaseDureeJournal,
  aujourdHui: Date = new Date()
): number | null {
  const debut = jour(cellule(cellules, phase.debut))
  const execution = dureeExecution(cellules, phase) ?? nombre(cellule(cellules, phase.dureeExecution))
  if (debut == null || execution == null) return null
  const ecoule = Math.round((Date.parse(`${aujourdHui.toISOString().slice(0, 10)}T00:00:00Z`) - debut) / JOUR_MS)
  return Math.max(0, Math.min(ecoule, execution))
}

/**
 * Avancement prévisionnel d'une phase = durée courue / durée d'exécution.
 * Vérifié sur les 5 phases : 28 / 78 / 80 / 80 / 80 lignes, 0 écart.
 */
export function avancementPrevisionnel(
  cellules: CelluleGrille[],
  phase: PhaseDureeJournal,
  aujourdHui: Date = new Date()
): number | null {
  const courue = dureeCourue(cellules, phase, aujourdHui) ?? nombre(cellule(cellules, phase.dureeCourue))
  const execution = dureeExecution(cellules, phase) ?? nombre(cellule(cellules, phase.dureeExecution))
  return courue == null || !execution ? null : courue / execution
}

/**
 * RESTE A LIVRER = 1 − LIVRAISON CPY. Vérifié sur 163 lignes, 0 écart.
 */
export function resteALivrer(cellules: CelluleGrille[]): number | null {
  const livre = nombre(cellule(cellules, COL_JOURNAL.livraisonCpy))
  return livre == null ? null : 1 - livre
}

/**
 * Avancement réel du SOUDAGE = nombre de pouces réalisés / nombre de pouces
 * total. Vérifié sur 155 lignes, 0 écart — et surtout PAS le rapport des
 * nombres de soudures (réalisées/total), qui diverge sur 20 lignes : c'est
 * bien le métrage soudé qui fait l'avancement, pas le comptage de joints.
 */
export function avancementReelSoudage(cellules: CelluleGrille[]): number | null {
  return ratio(cellule(cellules, COL_JOURNAL.poucesRealises), cellule(cellules, COL_JOURNAL.poucesTotal))
}

/** Index (1-based) de toutes les colonnes calculées, avec leur formule. */
export const COLONNES_DERIVEES_JOURNAL: { col: number; calcul: (c: CelluleGrille[], d: Date) => number | null; aide: string }[] = [
  { col: COL_JOURNAL.resteALivrer, calcul: (c) => resteALivrer(c), aide: '1 − livraison CPY' },
  {
    col: COL_JOURNAL.avancementReelSoudage,
    calcul: (c) => avancementReelSoudage(c),
    aide: 'pouces réalisés / pouces total',
  },
  ...PHASES_DUREE_JOURNAL.flatMap((phase) => [
    { col: phase.dureeExecution, calcul: (c: CelluleGrille[]) => dureeExecution(c, phase), aide: 'date de fin − date de début' },
    {
      col: phase.dureeCourue,
      calcul: (c: CelluleGrille[], d: Date) => dureeCourue(c, phase, d),
      aide: "jours écoulés depuis le début, plafonnés par la durée d'exécution",
    },
    {
      col: phase.avancementPrevisionnel,
      calcul: (c: CelluleGrille[], d: Date) => avancementPrevisionnel(c, phase, d),
      aide: "durée courue / durée d'exécution",
    },
  ]),
]

/**
 * Recalcule les colonnes dérivées d'une ligne du Journal. Une formule dont
 * les entrées manquent ne renvoie rien et laisse la valeur en place : sur les
 * lignes importées, beaucoup de phases n'ont pas de dates alors que leur
 * durée est renseignée — les écraser par du vide perdrait de la donnée
 * réelle.
 */
export function deriveLigneJournal(cellules: CelluleGrille[], aujourdHui: Date = new Date()): CelluleGrille[] {
  const sortie = [...cellules]
  for (const { col, calcul } of COLONNES_DERIVEES_JOURNAL) {
    const valeur = calcul(cellules, aujourdHui)
    if (valeur != null) sortie[col - 1] = valeur
  }
  return sortie
}

// --- Bandeau de KPI du Journal ---------------------------------------------
//
// Les 10 pourcentages affichés au-dessus des bandes de colonnes (lignes 2-3
// de la feuille) sont la moyenne de leur propre colonne — sauf deux, qui sont
// le complément de la colonne précédente : « Revue CPY » (col 6) = 1 − moyenne
// de « REALISATION CTR » (col 5), et « RESTE A LIVRER » (col 9) = 1 − moyenne
// de « LIVRAISON CPY » (col 8) et non la moyenne de la colonne 9 elle-même
// (2 lignes renseignent le reste sans la livraison, d'où 0,2648 au lieu de
// 0,2558). Vérifié sur les 165 lignes réelles : 0 écart sur les 10 KPI.
//
// Ils sont recalculés plutôt que repris du classeur pour la même raison que
// les résumés du module Procurement : figés, ils deviendraient faux dès la
// première saisie.
const KPI_COMPLEMENT: Record<number, number> = { 6: 5, 9: 8 }

function moyenneColonne(lignes: CelluleGrille[][], col: number): number | null {
  const valeurs = lignes.map((l) => nombre(cellule(l, col))).filter((v): v is number => v != null)
  return valeurs.length === 0 ? null : valeurs.reduce((a, b) => a + b, 0) / valeurs.length
}

export function kpisJournal(lignes: CelluleGrille[][], kpisClasseur: KpiJournal[]): KpiJournal[] {
  return kpisClasseur.map(({ col, valeur }) => {
    const source = KPI_COMPLEMENT[col]
    const moyenne = moyenneColonne(lignes, source ?? col)
    if (moyenne == null) return { col, valeur }
    return { col, valeur: source ? 1 - moyenne : moyenne }
  })
}
