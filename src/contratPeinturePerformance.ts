import type { LigneJournalPeinture, ParametresContratPeinture, PeintureCourbeSite } from '../types/contratPeinture'
import { effectifsDuJour, modeleDuSite, objectifJournalier } from './contratPeintureProductivite'
import { estTravaux, indexParId, productionDuJour } from './contratPeintureRapports'

// Mesure de la performance du contrat peinture (27/08/2026, `doc/Contrat
// peinture.docx`, § « Mesure de la performance » — lot 6).
//
//   « Dans le suivi journalier, la surface réellement peinte est comparée à
//   l'objectif calculé à partir des effectifs mobilisés. L'application doit
//   permettre de visualiser : l'objectif de production attendu ; la surface
//   réellement réalisée ; le taux d'atteinte de l'objectif ; l'écart entre le
//   réalisé et le prévisionnel. »
//
// Les quatre grandeurs, et rien de plus. Ce que le document demande ensuite —
// « identifier rapidement les situations de sous-performance ou de
// surperformance » — n'est **pas** livré comme une qualification : il ne donne
// aucun seuil, ni ici ni ailleurs (Q7 du recueil). L'écran montre donc le taux
// et l'écart signés, et laisse le lecteur juger.

const nombre = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

export interface PerformanceJour {
  date: string
  site: string
  /** Effectif pointé ce jour-là, par profil. */
  effectifs: { profil: string; effectif: number }[]
  /** Objectif calculé depuis cet effectif (lot 2). `null` si non calculable. */
  objectif: number | null
  /**
   * Surface réellement peinte **dans la journée** — la somme des productions
   * de chaque affaire, c'est-à-dire l'écart avec le rapport précédent.
   *
   * `null` — jamais 0 — quand aucune affaire du jour ne porte de lien de
   * reprise : c'est le cas de toutes les lignes importées du classeur, dont la
   * surface est cumulée à date sans qu'on sache à quoi la comparer.
   */
  production: number | null
  /** Affaires du jour, et combien d'entre elles ont un lien de reprise. */
  affaires: number
  affairesChainees: number
  /** Production / objectif. `null` si l'un des deux manque. */
  tauxAtteinte: number | null
  /** Production − objectif, en m². Signé : négatif = en dessous de l'objectif. */
  ecart: number | null
}

/**
 * La performance d'une journée sur un champ.
 *
 * Les deux termes viennent de sources différentes et c'est voulu : l'objectif
 * est **calculé** (effectif × coefficients), la production est **constatée**
 * (ce que les affaires déclarent avoir avancé). Les rapprocher est tout
 * l'objet de cet écran ; les faire dériver l'un de l'autre le viderait de son
 * sens.
 */
export function performanceDuJour(
  journal: LigneJournalPeinture[],
  parametres: ParametresContratPeinture | null,
  date: string,
  site: string,
  index = indexParId(journal)
): PerformanceJour {
  const effectifs = effectifsDuJour(journal, date, site)
  const modele = parametres ? modeleDuSite(parametres, site) : null
  const { objectif } = objectifJournalier(effectifs, modele)

  const duJour = journal.filter(
    (l) => l.date === date && (l.site ?? '').trim().toLowerCase() === site.trim().toLowerCase() && estTravaux(l)
  )
  const productions = duJour
    .map((l) => productionDuJour(l, index))
    .filter((v): v is number => v !== null)

  const production = productions.length ? productions.reduce((a, b) => a + b, 0) : null

  return {
    date,
    site,
    effectifs,
    objectif,
    production,
    affaires: duJour.length,
    affairesChainees: productions.length,
    tauxAtteinte: production !== null && objectif ? production / objectif : null,
    ecart: production !== null && objectif !== null ? production - objectif : null,
  }
}

/** La série des journées d'un champ, de la plus récente à la plus ancienne. */
export function performanceParJour(
  journal: LigneJournalPeinture[],
  parametres: ParametresContratPeinture | null,
  site: string
): PerformanceJour[] {
  const index = indexParId(journal)
  const dates = [
    ...new Set(
      journal
        .filter((l) => (l.site ?? '').trim().toLowerCase() === site.trim().toLowerCase() && estTravaux(l))
        .map((l) => l.date)
    ),
  ].sort((a, b) => b.localeCompare(a))
  return dates.map((d) => performanceDuJour(journal, parametres, d, site, index))
}

export interface CumulPerformance {
  jours: number
  joursMesures: number
  objectif: number | null
  production: number | null
  tauxAtteinte: number | null
  ecart: number | null
}

/**
 * Cumul sur une série de journées.
 *
 * **N'agrège que les journées où les deux termes sont connus**, et dit sur
 * combien elle porte : un objectif cumulé sur 30 jours rapproché d'une
 * production connue sur 3 donnerait un taux d'atteinte de 10 % qui ne
 * voudrait rien dire. Même précaution que `moyennesDelais()` du module
 * Contrat (26/08/2026).
 */
export function cumulPerformance(jours: PerformanceJour[]): CumulPerformance {
  const mesures = jours.filter((j) => j.production !== null && j.objectif !== null)
  if (!mesures.length) {
    return { jours: jours.length, joursMesures: 0, objectif: null, production: null, tauxAtteinte: null, ecart: null }
  }
  const objectif = mesures.reduce((t, j) => t + (j.objectif ?? 0), 0)
  const production = mesures.reduce((t, j) => t + (j.production ?? 0), 0)
  return {
    jours: jours.length,
    joursMesures: mesures.length,
    objectif,
    production,
    tauxAtteinte: objectif ? production / objectif : null,
    ecart: production - objectif,
  }
}

/**
 * Taux de réalisation d'un site : surface réalisée / plan de charge
 * prévisionnel.
 *
 * **Dérivé et non plus repris du classeur** : ces deux taux étaient figés dans
 * le blob du reporting de mai 2026, et seraient devenus faux dès qu'une valeur
 * de la courbe aurait bougé. Vérifiés à l'identique sur les 3 sites avant la
 * bascule (0,838644 · 0,806118 · 0,973572).
 */
export function tauxRealisationSite(courbe: PeintureCourbeSite): number | null {
  return courbe.totalPlanCharge ? courbe.totalRealise / courbe.totalPlanCharge : null
}

/**
 * Taux de productivité d'un site : surface réalisée / cible contractuelle.
 * Même bascule, mêmes valeurs vérifiées (0,71817 · 0,811077 · 0,515742).
 */
export function tauxProductiviteSite(courbe: PeintureCourbeSite): number | null {
  return courbe.totalCible ? courbe.totalRealise / courbe.totalCible : null
}

/**
 * La cible journalière d'un site, prise **dans les paramètres** plutôt que
 * dans le blob du classeur.
 *
 * Vérifié avant bascule : les 31 points de chacun des 3 sites portent
 * exactement `objectifJourM2` (10 m²). C'est donc bien la même grandeur — et
 * la lire dans les paramètres est ce qui fait qu'un changement d'objectif
 * contractuel se voit enfin sur la courbe, au lieu de rester dans un blob
 * figé (le « si demain l'objectif change, la logique doit rester la même » du
 * document).
 *
 * Sans paramètres, la valeur du classeur est conservée : on ne vide pas une
 * courbe importée.
 */
export function cibleJournaliereSite(
  parametres: ParametresContratPeinture | null,
  site: string,
  cibleDuClasseur: number
): number {
  const s = parametres?.sites.find((x) => x.site.trim().toLowerCase() === site.trim().toLowerCase())
  return nombre(s?.objectifJourM2) ?? cibleDuClasseur
}
