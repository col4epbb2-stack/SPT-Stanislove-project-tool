import type { Planning, Tache, VuePlanning } from '../types/planning'
import type { ActiviteCourbe, VueCourbe } from '../types/courbeEnS'
import { semaineDeLAxe } from './courbeEnSEngine'
import { COURBE_TYPE_DEFAUT } from '../types/courbeEnS'
import { forecastHerite } from './planning'

// Conversion du planning d'une fiche projet en activités de courbe en S
// (14/08/2026).
//
// Les deux décrivaient déjà le même objet : `Planning` a trois vues (baseline,
// forecast, réalisé) et `Tache` porte, une par une, les colonnes des feuilles
// « Projet_*_Actualisé » du classeur — jusqu'à « Typical S-curve »,
// « Pondération par phase » et « BU/Phase ». Chaque fiche créée recevait donc
// d'office ses 7 tâches, pendant que sa courbe en S démarrait vide : il fallait
// ressaisir les mêmes dates deux fois.
//
// Le planning devient la source. Ne restent propres au module courbe en S que
// deux choses : les activités reprises du classeur KPI_ICP (10 projets qui
// n'ont pas de fiche), et le gabarit d'avancement, que le planning porte mais
// que rien ne remplissait — d'où l'éditeur de gabarits de l'onglet.

const VUES: { planning: VuePlanning; courbe: VueCourbe }[] = [
  { planning: 'baseline', courbe: 'baseline' },
  { planning: 'forecast', courbe: 'forecast' },
  { planning: 'reel', courbe: 'realise' },
]

function versActivite(tache: Tache, vue: VueCourbe, ordre: number, projet: string, projetId: string): ActiviteCourbe {
  return {
    // L'id de la tâche préfixé par la vue : les 3 vues partagent le même id de
    // tâche (c'est le principe du planning), il faut les distinguer ici.
    id: `${vue}-${tache.id}`,
    vue,
    ordre,
    projet,
    projetId,
    typeAvis: tache.type ?? null,
    classification: tache.classification ?? null,
    phase: tache.phase,
    activite: tache.nom,
    champ: tache.champ ?? null,
    plateforme: tache.plateforme ?? null,
    service: tache.service ?? null,
    debut: tache.dateDebut || null,
    fin: tache.dateFin || null,
    // Allure de l'activité : la courbe type **retenue dans le planning**,
    // dont la forme est lue dans les 5 modèles du paramétrage (Paramètres ›
    // Courbes types, la feuille « typical S curve » du classeur) — c'est le
    // `RECHERCHEH(… ; 'typical S curve'!$K$10:$DG$15 ; type+1)` des colonnes
    // hebdomadaires.
    //
    // **À défaut, le Type 4 — Construction (EPC)** (22/08/2026, retour
    // utilisateur « chaque phase a une courbe : regarde le modèle des courbes
    // dans le paramétrage en fonction du type associé dans les plannings »).
    // Sans lui, une tâche sans gabarit vaut 0 jusqu'à la veille de sa fin puis
    // 1 : la courbe d'un planning importé ou créé avant le 22/08/2026 — aucun
    // ne porte de gabarit — était un escalier, pas une courbe en S. C'est la
    // valeur par défaut que le document impose à la colonne, appliquée ici à
    // la lecture pour que les fiches déjà en base en profitent sans migration.
    //
    // Les activités **reprises du classeur** ne passent pas par ici : elles
    // gardent leur colonne d'origine, y compris vide, et rendent alors 0 comme
    // le #N/A d'Excel.
    courbeType: tache.typicalSCurve ?? COURBE_TYPE_DEFAUT,
    tests: tache.tests ?? null,
    budget: tache.budget ?? null,
  }
}

export interface ActivitesDepuisPlanning {
  baseline: ActiviteCourbe[]
  forecast: ActiviteCourbe[]
  realise: ActiviteCourbe[]
}

/**
 * Les 3 vues du planning, vues comme les 3 feuilles d'activités du classeur.
 *
 * La vue Réalisé reçoit un relevé unique : le planning connaît l'avancement
 * d'aujourd'hui, pas son historique semaine par semaine. La courbe Réalisé est
 * donc un point, qui deviendra une courbe au fil des pointages — plutôt qu'un
 * historique inventé à rebours depuis le pourcentage actuel.
 *
 * Ce relevé est daté de **la semaine de l'axe qui contient aujourd'hui**, et
 * non du jour même : dans le classeur, un pointage se saisit dans la colonne de
 * sa semaine, et c'est cette date-là que la courbe va rechercher. Daté du jour,
 * il tombe entre deux colonnes 6 fois sur 7 et n'est jamais tracé.
 */
export function activitesDepuisPlanning(
  planning: Planning,
  projet: { id: string; nom: string },
  aujourdHui = new Date().toISOString().slice(0, 10)
): ActivitesDepuisPlanning {
  const resultat: ActivitesDepuisPlanning = { baseline: [], forecast: [], realise: [] }
  // L'axe part du plus petit début de la baseline (`=+MIN(Baseline[Start])`) —
  // c'est la grille sur laquelle la courbe est tracée, donc celle qui date le
  // relevé. Rien à dater tant qu'aucune tâche n'a de date de début.
  const origine = planning.baseline.reduce<string | null>(
    (min, t) => (t.dateDebut && (min === null || t.dateDebut < min) ? t.dateDebut : min),
    null
  )
  const semaine = origine ? semaineDeLAxe(origine, aujourdHui) : null

  for (const { planning: vuePlanning, courbe } of VUES) {
    // Le forecast reprend de la baseline tout ce qui n'est pas ses dates
    // (`forecastHerite`) : sans ça, une courbe type ou un budget posé sur la
    // baseline après coup ne serait pas suivi par la courbe Forecast, qui
    // tracerait alors deux fois le même travail selon deux règles.
    const taches = vuePlanning === 'forecast' ? forecastHerite(planning) : planning[vuePlanning]
    resultat[courbe] = taches.map((tache, index) => {
      const activite = versActivite(tache, courbe, tache.numeroOrdre ?? index + 1, projet.nom, projet.id)
      // Avant la première semaine de l'axe, la feuille n'a pas de colonne où
      // porter le relevé : rien n'est daté plutôt qu'un point hors grille.
      if (courbe !== 'realise') return activite
      // Les relevés saisis semaine par semaine (22/08/2026) font foi : c'est
      // la saisie de la feuille Réalisé du classeur, et elle porte un
      // historique. À défaut — tâche jamais pointée dans la nouvelle saisie —
      // on retombe sur le relevé unique daté de la semaine en cours, qui était
      // le seul comportement possible tant que la fiche ne gardait qu'un
      // chiffre par tâche.
      const releves = tache.realiseHebdo
      if (releves && Object.keys(releves).length > 0) {
        return {
          ...activite,
          realiseHebdo: Object.fromEntries(
            Object.entries(releves).map(([sem, pct]) => [sem, pct / 100])
          ),
        }
      }
      if (semaine === null) return activite
      return { ...activite, realiseHebdo: { [semaine]: (tache.avancement ?? 0) / 100 } }
    })
  }

  return resultat
}

/**
 * Les semaines de l'axe d'un planning — `=+MIN(Baseline[Start])` puis `+7`,
 * 53 colonnes, comme les feuilles du classeur. C'est la grille dans laquelle
 * un relevé Réalisé se saisit : hors d'elle, la feuille n'a pas de colonne où
 * le porter.
 */
export function axeSemainesPlanning(planning: Planning, nbSemaines = 53): string[] {
  const origine = planning.baseline.reduce<string | null>(
    (min, t) => (t.dateDebut && (min === null || t.dateDebut < min) ? t.dateDebut : min),
    null
  )
  if (!origine) return []
  return Array.from({ length: nbSemaines }, (_, i) => {
    const date = new Date(`${origine}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + 7 * i)
    return date.toISOString().slice(0, 10)
  })
}

/** Vrai dès qu'une tâche porte un gabarit : sans aucun, la courbe planifiée
 * resterait plate à zéro et l'onglet doit le dire plutôt que l'afficher. */
export function planningPorteUnGabarit(planning: Planning): boolean {
  return planning.baseline.some((t) => t.typicalSCurve != null)
}

/** Tâches de la baseline dont le gabarit reste à choisir. */
export function tachesSansGabarit(planning: Planning): Tache[] {
  return planning.baseline.filter((t) => t.typicalSCurve == null)
}
