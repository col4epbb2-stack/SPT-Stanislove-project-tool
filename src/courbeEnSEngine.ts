import { COURBES_TYPES } from '../data/courbeEnS/courbesTypes'
import type {
  ActiviteCalculs,
  ActiviteCourbe,
  NumeroCourbeType,
  PointProgression,
  SyntheseProgression,
} from '../types/courbeEnS'

// Port du calcul de courbe en S du classeur KPI_ICP_2905.xlsm. Toutes les
// fonctions sont pures : elles prennent les activités déjà chargées et ne
// lisent rien d'autre que les gabarits de la feuille « typical S curve ».
//
// Vérification avant écriture : les 3 blocs de pivot de la feuille « Data
// courbe en S » gardent en cache l'avancement calculé par le classeur pour
// chaque activité et chaque semaine. `avancementPlanifie` a été rejouée sur
// la totalité de ces cellules — 3 612 valeurs, 18 blocs (Baseline et Forecast
// des 9 projets suivis) : 0 divergence.
//
// (Les lignes « % » de 3 de ces blocs, elles, ne concordent pas — elles
// affichent les valeurs d'un autre projet et une pondération globale au lieu
// de la pondération par phase. Ce sont des caches de tableau croisé jamais
// actualisés : le classeur le signale lui-même en tête de Progress_Curve,
// « Actualiser les données ------> ». Ce module recalcule tout, il n'hérite
// donc pas de cette dérive.)

const MS_JOUR = 86_400_000

/** Dates ISO lues en UTC : l'écart entre deux dates doit être un nombre entier
 * de jours, comme les numéros de série d'Excel — un décalage horaire local
 * ferait basculer un arrondi d'une unité de temps à l'autre. */
function versDate(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

function joursEntre(depuis: string, jusqua: string): number {
  return Math.round((versDate(jusqua) - versDate(depuis)) / MS_JOUR)
}

export function ajouterJours(iso: string, jours: number): string {
  return new Date(versDate(iso) + jours * MS_JOUR).toISOString().slice(0, 10)
}

/**
 * Colonne hebdomadaire de l'axe qui contient une date.
 *
 * Les feuilles avancent de 7 en 7 depuis `MIN(<table>[Start])` et un relevé s'y
 * saisit DANS la colonne de sa semaine — jamais à une date libre : c'est la
 * grille elle-même qui date le pointage. Ce calage est implicite quand on tape
 * dans une cellule ; il doit être refait quand le relevé vient d'ailleurs, sans
 * quoi il tombe entre deux colonnes et n'est jamais lu (le classeur va chercher
 * la période par `XLOOKUP` sur la ligne des dates, une période absente rendant
 * #N/A, donc un trou dans la courbe).
 *
 * `null` avant l'origine : la feuille n'a pas de colonne avant sa 1ʳᵉ semaine.
 */
export function semaineDeLAxe(origine: string, date: string): string | null {
  const jours = joursEntre(origine, date)
  if (jours < 0) return null
  return ajouterJours(origine, Math.floor(jours / 7) * 7)
}

/** Colonne « Duation (d) » : `=P7-O7+1`, bornes incluses. */
export function dureeJours(debut: string | null, fin: string | null): number | null {
  if (!debut || !fin) return null
  const duree = joursEntre(debut, fin) + 1
  return duree > 0 ? duree : null
}

export function gabarit(numero: NumeroCourbeType | null) {
  return COURBES_TYPES.find((c) => c.numero === numero) ?? null
}

/**
 * Avancement planifié d'une activité à une date — la formule des colonnes
 * hebdomadaires des feuilles Baseline et Forecast, reprise à l'identique :
 *
 *   =SI(OU($O7=0;$P7=0);0;
 *      SI(Y$5<$O7;0;
 *        SI(Y$5>=$P7;1;
 *          RECHERCHEH(ARRONDI((Y$5-$O7)*100/$Q7;0);
 *                     'typical S curve'!$K$10:$DG$15;$R7+1;FAUX))))
 *
 * Soit : 0 avant le début, 1 à partir de la date de fin, et entre les deux la
 * valeur du gabarit à l'unité de temps atteinte — l'activité est ramenée sur
 * l'échelle 0-100 UT de la feuille des courbes types, puis arrondie à l'entier.
 * L'arrondi est celui d'Excel (au plus proche, 0,5 s'éloignant de zéro) ; les
 * arguments étant toujours positifs ici, `Math.round` en est l'équivalent.
 */
export function avancementPlanifie(activite: ActiviteCourbe, date: string): number {
  const { debut, fin } = activite
  if (!debut || !fin) return 0
  if (versDate(date) < versDate(debut)) return 0
  if (versDate(date) >= versDate(fin)) return 1
  const duree = dureeJours(debut, fin)
  const courbe = gabarit(activite.courbeType)
  // Sans gabarit, le RECHERCHEH du classeur renvoie #N/A : rien à afficher
  // plutôt qu'une progression linéaire inventée à la place.
  if (!duree || !courbe) return 0
  const ut = Math.round((joursEntre(debut, date) * 100) / duree)
  return courbe.cumul[Math.min(Math.max(ut, 0), courbe.cumul.length - 1)] ?? 0
}

/** Vue Réalisé : l'avancement n'est pas déduit d'un gabarit mais relevé chaque
 * semaine. `null` = semaine non renseignée (cf. `avancementProjetRealise`). */
export function avancementReleve(activite: ActiviteCourbe, date: string): number | null {
  const valeur = activite.realiseHebdo?.[date]
  return typeof valeur === 'number' ? valeur : null
}

/**
 * Axe hebdomadaire des 3 feuilles : `=+MIN(Baseline[Start])` puis `=+Y5+7`,
 * sur 53 colonnes (la largeur des tables du classeur, soit une année).
 */
export function axeSemaines(activites: ActiviteCourbe[], nbSemaines = 53): string[] {
  const debuts = activites.map((a) => a.debut).filter((d): d is string => Boolean(d))
  if (debuts.length === 0) return []
  const premier = debuts.reduce((min, d) => (versDate(d) < versDate(min) ? d : min))
  return Array.from({ length: nbSemaines }, (_, i) => ajouterJours(premier, 7 * i))
}

/** Ligne « Semaine » des feuilles : `=+"S"&NO.SEMAINE(Y5)`. NO.SEMAINE sans
 * second argument compte les semaines à partir du 1er janvier, la première
 * semaine étant celle qui le contient — ce n'est pas la norme ISO. */
export function numeroSemaine(iso: string): string {
  const date = new Date(versDate(iso))
  const premierJanvier = Date.UTC(date.getUTCFullYear(), 0, 1)
  const jours = Math.round((versDate(iso) - premierJanvier) / MS_JOUR)
  return `S${Math.floor((jours + new Date(premierJanvier).getUTCDay()) / 7) + 1}`
}

function sommeDurees(activites: ActiviteCourbe[]): number {
  return activites.reduce((total, a) => total + (dureeJours(a.debut, a.fin) ?? 0), 0)
}

/** Colonnes calculées d'une activité : durée, les deux pondérations et BU/Phase.
 * `toutes` = les activités de la même feuille (pour la pondération globale). */
export function calculsActivite(activite: ActiviteCourbe, toutes: ActiviteCourbe[]): ActiviteCalculs {
  const duree = dureeJours(activite.debut, activite.fin)
  const totalFeuille = sommeDurees(toutes)
  const totalProjet = sommeDurees(toutes.filter((a) => a.projet === activite.projet))
  const ponderation = duree && totalFeuille ? duree / totalFeuille : null
  return {
    duree,
    ponderation,
    ponderationParPhase: duree && totalProjet ? duree / totalProjet : null,
    buPhase: activite.budget !== null && ponderation !== null ? activite.budget * ponderation : null,
  }
}

/**
 * Avancement d'un projet à une date : la ligne « % » des blocs de la feuille
 * « Data courbe en S », `=SOMMEPROD($C$10:$C$16;D10:D16)` — la moyenne des
 * avancements de ses activités, pondérée par leur durée.
 *
 * `activitesProjet` doit ne contenir que les activités du projet : c'est ce
 * découpage qui fait de la pondération par phase une somme égale à 1.
 */
export function avancementProjet(activitesProjet: ActiviteCourbe[], date: string): number {
  const total = sommeDurees(activitesProjet)
  if (!total) return 0
  return activitesProjet.reduce((cumul, a) => {
    const duree = dureeJours(a.debut, a.fin) ?? 0
    return cumul + (duree / total) * avancementPlanifie(a, date)
  }, 0)
}

/**
 * Même pondération, sur les relevés de la vue Réalisé.
 *
 * Seule différence assumée avec le classeur : une semaine dont AUCUNE activité
 * n'a de relevé rend `null` (courbe interrompue) là où le classeur affiche 0.
 * Ses cellules vides valent 0 dans un SOMMEPROD, ce qui fait retomber sa
 * courbe Réalisé à zéro après la dernière semaine pointée — un artefact de
 * tableur, pas un avancement. Les semaines renseignées, elles, donnent le
 * même nombre qu'Excel.
 */
export function avancementProjetRealise(activitesProjet: ActiviteCourbe[], date: string): number | null {
  const total = sommeDurees(activitesProjet)
  if (!total) return null
  if (!activitesProjet.some((a) => avancementReleve(a, date) !== null)) return null
  return activitesProjet.reduce((cumul, a) => {
    const duree = dureeJours(a.debut, a.fin) ?? 0
    return cumul + (duree / total) * (avancementReleve(a, date) ?? 0)
  }, 0)
}

/** Tous les projets d'une feuille, dans l'ordre d'apparition. */
export function projetsDe(activites: ActiviteCourbe[]): string[] {
  return [...new Set(activites.map((a) => a.projet))]
}

function ecart(a: number | null, b: number): number | null {
  return a === null ? null : a - b
}

/**
 * La feuille « Progress_Curve » d'un projet : cumul Baseline / Forecast /
 * Réalisé à chaque semaine, écart au planning de référence, et « Monthly
 * effort » (colonnes K, L, M) qui est la variation du cumul d'une période à
 * l'autre — `=F9-F8`.
 */
export function courbeProgression(
  projet: string,
  activites: { baseline: ActiviteCourbe[]; forecast: ActiviteCourbe[]; realise: ActiviteCourbe[] },
  semaines: string[]
): PointProgression[] {
  const baseline = activites.baseline.filter((a) => a.projet === projet)
  const forecast = activites.forecast.filter((a) => a.projet === projet)
  const realise = activites.realise.filter((a) => a.projet === projet)

  return semaines.map((date, i) => {
    const cumulBaseline = avancementProjet(baseline, date)
    const cumulForecast = forecast.length ? avancementProjet(forecast, date) : null
    const cumulRealise = realise.length ? avancementProjetRealise(realise, date) : null
    const precedent = i === 0 ? null : semaines[i - 1]
    const veilleBaseline = precedent ? avancementProjet(baseline, precedent) : 0
    const veilleForecast = precedent && forecast.length ? avancementProjet(forecast, precedent) : 0
    const veilleRealise = precedent && realise.length ? avancementProjetRealise(realise, precedent) : 0

    return {
      date,
      semaine: numeroSemaine(date),
      baseline: cumulBaseline,
      forecast: cumulForecast,
      realise: cumulRealise,
      delta: ecart(cumulRealise, cumulBaseline),
      effortBaseline: cumulBaseline - veilleBaseline,
      effortForecast: cumulForecast === null ? null : cumulForecast - (veilleForecast ?? 0),
      effortRealise: cumulRealise === null ? null : cumulRealise - (veilleRealise ?? 0),
    }
  })
}

/**
 * Fenêtre d'affichage : le classeur ne trace pas les 53 semaines de l'axe mais
 * un bloc borné, de la période qui précède le premier mouvement (elle vaut 0,
 * elle donne l'échelle) à quelques périodes après le dernier.
 *
 * **Relevé dans `KPI_ICP_30062026 -.xlsm`** (22/08/2026), sur les 5 blocs de
 * `Progress_Curve` et les plages que leurs graphiques tracent réellement :
 *
 *   lignes    périodes   dernier mouvement   plateau tracé après
 *    8-23        16            idx 11               4
 *   38-55        18            idx 17               0
 *   76-105       30            idx 27               2
 *   120-149      30            idx 29               0
 *   161-180      20            idx 17               2
 *
 * Autrement dit : le tracé s'arrête **avec la courbe**, à 0 à 4 périodes près.
 * La version précédente de cette fonction ne rognait que l'amorce et gardait
 * tout le reste de l'axe — sur un chantier de 6 semaines, la montée occupait
 * un huitième du graphique et les 45 semaines suivantes étaient un trait plat.
 * Le plateau fait partie de l'allure, mais un plateau **borné** : c'est
 * exactement ce que la note du 14/08/2026 avait lu à moitié, en concluant de
 * ce bloc de référence qu'il ne fallait plus couper du tout.
 *
 * La marge retenue est celle du bloc de référence (4) — celui du projet
 * « Remplacement tronçon de ligne riser 6" », dont le graphique est reproduit
 * à l'identique : 16 périodes, dont 10 à 100 %.
 */
export function fenetreProjet(points: PointProgression[], marge = 4): PointProgression[] {
  if (points.length === 0) return points
  const premier = points.findIndex((p) => p.baseline > 0 || (p.realise ?? 0) > 0 || (p.forecast ?? 0) > 0)
  if (premier === -1) return points

  // Dernier mouvement, toutes séries confondues : l'index où une courbe prend
  // une valeur différente de son précédent relevé. Un `null` n'est pas un
  // changement — c'est une absence de relevé, elle n'allonge pas la fenêtre.
  let dernier = premier
  for (const cle of ['baseline', 'forecast', 'realise'] as const) {
    let precedente: number | null = null
    points.forEach((point, index) => {
      const valeur = point[cle]
      if (valeur === null) return
      if (precedente !== null && Math.abs(valeur - precedente) > 1e-12) dernier = Math.max(dernier, index)
      precedente = valeur
    })
  }

  return points.slice(Math.max(0, premier - 1), Math.min(points.length, dernier + marge + 1))
}

/**
 * Bandeau de tête de Progress_Curve : le dernier cumul connu de chaque courbe
 * (`=RECHERCHE(2;1/(F8:F25<>"");F8:F25)`, soit la dernière cellule non vide),
 * leur écart, et le retard — `=SI(M5<0;M5;0%)` : l'écart ne compte comme
 * retard que s'il est négatif, une avance n'est pas un retard.
 */
export function syntheseProgression(
  projet: string,
  points: PointProgression[],
  activitesProjet: ActiviteCourbe[],
  aujourdHui = new Date().toISOString().slice(0, 10)
): SyntheseProgression {
  const dernierRealise = [...points].reverse().find((p) => p.realise !== null) ?? null
  const debuts = activitesProjet.map((a) => a.debut).filter((d): d is string => Boolean(d))
  const fins = activitesProjet.map((a) => a.fin).filter((d): d is string => Boolean(d))
  const debut = debuts.length ? debuts.reduce((m, d) => (versDate(d) < versDate(m) ? d : m)) : null
  const fin = fins.length ? fins.reduce((m, d) => (versDate(d) > versDate(m) ? d : m)) : null
  // Le retard se lit à la date du dernier relevé, pas en fin de courbe :
  // comparer un réalisé de mars à un prévisionnel de décembre n'aurait aucun
  // sens (l'écart vaudrait toujours 100 %).
  const previsionnel = dernierRealise ? dernierRealise.baseline : (points[points.length - 1]?.baseline ?? 0)
  const realise = dernierRealise?.realise ?? null

  return {
    projet,
    previsionnel,
    realise,
    ecart: dernierRealise?.delta ?? null,
    retard: (dernierRealise?.delta ?? 0) < 0 ? dernierRealise!.delta : 0,
    debut,
    fin,
    joursRestants: fin ? Math.max(0, joursEntre(aujourdHui, fin)) : null,
  }
}
