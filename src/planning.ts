import type { PhaseNom } from '../types/project'
import type { Planning, Tache } from '../types/planning'
import { avancementPlanning } from '../types/planning'
import { COURBE_TYPE_DEFAUT } from '../types/courbeEnS'
import { phasesPresentes } from '../types/suivi'

export const PHASES_PAR_DEFAUT: PhaseNom[] = ['Ingénierie', 'Études', 'Exécution', 'Clôture']

const DEFAULT_TACHES: { phase: PhaseNom; nom: string }[] = [
  { phase: 'Ingénierie', nom: 'Préparation SOW et AO' },
  { phase: 'Ingénierie', nom: 'Études' },
  { phase: 'Ingénierie', nom: 'Approvisionnement' },
  { phase: 'Exécution', nom: 'Travaux atelier' },
  { phase: 'Exécution', nom: 'Travaux site' },
  { phase: 'Clôture', nom: 'Réception des travaux' },
  { phase: 'Clôture', nom: 'Démobilisation' },
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function createDefaultPlanning(dateDebut: string, dateFin: string): Planning {
  const start = new Date(dateDebut)
  const end = new Date(dateFin)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY))
  const segment = totalDays / DEFAULT_TACHES.length

  const baseline: Tache[] = DEFAULT_TACHES.map((t, index) => {
    const debut = new Date(start.getTime() + Math.round(index * segment) * MS_PER_DAY)
    const fin = new Date(start.getTime() + Math.round((index + 1) * segment - 1) * MS_PER_DAY)
    return {
      id: crypto.randomUUID(),
      phase: t.phase,
      nom: t.nom,
      dateDebut: toISODate(debut),
      dateFin: toISODate(fin),
      avancement: 0,
      dureeJours: Math.round(segment),
      numeroOrdre: index + 1,
      // Type 4 — Construction (EPC) d'office : le cas majoritaire, modifiable
      // ensuite dans la colonne « Typical S-curve » du planning (22/08/2026).
      typicalSCurve: COURBE_TYPE_DEFAUT,
    }
  })

  // Même `id` sur les 3 vues (retour utilisateur : "les données définies
  // dans la baseline doivent être les mêmes références utilisées dans le
  // forecast et le planning réel") — seules dates/avancement divergent
  // ensuite par vue, jamais l'identité de la tâche.
  return {
    baseline,
    forecast: baseline.map((t) => ({ ...t })),
    reel: baseline.map((t) => ({ ...t })),
  }
}

/**
 * Le Forecast tel que le document le décrit (22/08/2026) : « la feuille
 * Forecast doit être quasiment identique à la feuille Baseline. Elle reprend
 * les mêmes phases, les mêmes sous-phases, les mêmes pondérations, les mêmes
 * types de S-Curve, les mêmes budgets. […] Les seules informations qui doivent
 * pouvoir être modifiées sont : date de début, date de fin. Tout le reste doit
 * être verrouillé ou automatiquement repris depuis la Baseline afin d'éviter
 * toute incohérence entre les deux plannings. »
 *
 * L'héritage se fait **à la lecture** et non par recopie à l'écriture : une
 * copie posée au moment de la modification redeviendrait fausse au premier
 * champ de la baseline qu'un futur écran laisserait modifier sans y penser.
 * Ici, la question ne se pose plus — le forecast n'a que ses dates à lui.
 *
 * Ce qui reste propre au forecast :
 * - `dateDebut` / `dateFin`, les deux seules saisies de la vue ;
 * - `dureeJours`, qui découle de ces dates ;
 * - `avancement`, que ces dates calculent (`avancementAutomatique`).
 *
 * Une tâche présente au forecast mais absente de la baseline est laissée
 * telle quelle : ça n'arrive pas depuis l'application (les 3 vues partagent
 * leurs identifiants), mais un import pourrait en produire, et l'écarter
 * reviendrait à la faire disparaître de l'écran.
 */
export function forecastHerite(planning: Planning): Tache[] {
  const baselineParId = new Map(planning.baseline.map((t) => [t.id, t]))
  return planning.forecast.map((f) => {
    const b = baselineParId.get(f.id)
    if (!b) return f
    return { ...b, dateDebut: f.dateDebut, dateFin: f.dateFin, dureeJours: f.dureeJours, avancement: f.avancement }
  })
}

// % d'avancement Forecast, calculé automatiquement depuis les dates modifiables
// (CDS : "Forecast — dates modifiables, % calculé automatiquement") : position
// du jour courant dans l'intervalle [dateDebut, dateFin], 0 avant le début,
// 100 après la fin.
export function avancementAutomatique(dateDebut: string, dateFin: string, aujourdhui: Date = new Date()): number {
  const debut = new Date(dateDebut).getTime()
  const fin = new Date(dateFin).getTime()
  const now = aujourdhui.getTime()
  if (now <= debut) return 0
  if (fin <= debut || now >= fin) return 100
  return Math.round(((now - debut) / (fin - debut)) * 100)
}

// Phase en cours = la première phase (dans l'ordre d'apparition des tâches)
// dont l'avancement moyen n'est pas encore à 100 % — sinon la dernière phase
// (tout est terminé), sinon aucune (pas de tâches). Sert à "justifier le
// niveau d'avancement affiché" (retour utilisateur feuille de route).
/**
 * Phases **en cours** d'un planning, avec leur avancement (21/08/2026,
 * demande explicite de `doc/feuille de route commentaire.docx`).
 *
 * `phaseActuelle` ne rend qu'un nom, et un seul : la feuille de route
 * affichait donc « Exécution » sans dire où elle en était, et taisait les
 * phases menées en parallèle. Le document donne la règle et son exemple :
 * « dès lors que plusieurs phases ont un taux d'avancement supérieur à 0 % et
 * inférieur à 100 %, elles peuvent être considérées comme étant en cours »
 * — Étude 100 / Exécution 50 / Clôture 10 doit afficher Exécution (50 %) *et*
 * Clôture (10 %).
 *
 * Les deux bornes n'ont pas de phase « en cours » au sens strict, et rendre
 * une liste vide effacerait l'information : un planning entièrement à 0 %
 * rend sa première phase, un planning entièrement terminé rend la dernière —
 * ce que `phaseActuelle` faisait déjà pour ce second cas.
 */
export function phasesEnCours(taches: Tache[]): { phase: PhaseNom; avancement: number }[] {
  const phases = phasesPresentes(taches)
  if (phases.length === 0) return []
  const avecAvancement = phases.map((phase) => ({
    phase,
    avancement: avancementPlanning(taches.filter((t) => t.phase === phase)),
  }))
  const enCours = avecAvancement.filter((p) => p.avancement > 0 && p.avancement < 100)
  if (enCours.length > 0) return enCours
  const derniere = avecAvancement[avecAvancement.length - 1]
  return derniere.avancement >= 100 ? [derniere] : [avecAvancement[0]]
}

export function phaseActuelle(taches: Tache[]): PhaseNom | null {
  const phases = phasesPresentes(taches)
  if (phases.length === 0) return null
  for (const phase of phases) {
    const tachesPhase = taches.filter((t) => t.phase === phase)
    if (avancementPlanning(tachesPhase) < 100) return phase
  }
  return phases[phases.length - 1]
}
