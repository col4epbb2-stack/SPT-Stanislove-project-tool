// Matching du portefeuille : Feuille de route (Work Program) → Navette, puis
// Fiches projet → Feuille de route (24/08/2026, demande explicite « un algo
// qui va faire un matching : lier tous les items présents dans la feuille de
// route avec WP à ce qui est présent dans la navette, ensuite lier tous les
// projets […] avec ce qui est présent dans feuille de route afin d'avoir des
// informations complètes et réutilisables dans les parties »).
//
// Ce que ce module ajoute à `rapprochementPortefeuille.ts` (23/08/2026), qui
// reste en place pour la reprise à la main dans l'écran Rapprochement :
//   - un **score**, et non plus une cascade de critères testés un à un. Une
//     ligne de feuille de route et une ligne navette se ressemblent sur
//     plusieurs plans à la fois (imputation, intitulé, champ, Work Program,
//     année, budget) ; la cascade s'arrêtait au premier critère qui répondait,
//     donc une imputation absente faisait retomber tout le poids sur
//     l'intitulé exact — et un intitulé à un mot près ne rapprochait rien ;
//   - le **périmètre Work Program**, qui est la demande : une ligne WP de la
//     feuille de route vient d'une ligne navette, c'est là que la cible de
//     100 % s'applique ;
//   - la distinction **automatique / à confirmer**. Rien de flou n'est écrit :
//     ce qui n'est pas décidé par une clé forte ou un score franc est proposé,
//     et attend un choix.
//
// Les deux principes des migrations (lib/migrations.ts) sont tenus ici aussi :
// **idempotence** — un lien déjà posé n'est jamais réécrit, relancer ne change
// rien — et **analyse d'abord** : tout ce qui décide de ce qui sera écrit est
// pur et affiché avant la moindre écriture.

import { doc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestoreCollections'
import { enLots } from './migrations'
import { SEUIL_SUGGESTION, jaccard, normaliser, tokensSignificatifs } from './liaison'
import { libelleComparable, otpFeuilleDeRoute, ligneFdrDepuisProjet, prochainsIdsFdr } from './rapprochementPortefeuille'
import type { ProjetFeuilleDeRoute } from '../types/feuilleDeRoute'
import type { LigneNavette } from '../types/navette'
import type { Projet } from '../types/project'

// ---------------------------------------------------------------------------
// Réglages du score

/**
 * Poids des critères — l'imputation d'abord, l'intitulé ensuite.
 *
 * Ce ne sont pas des valeurs choisies au hasard : elles reprennent l'ordre de
 * fiabilité déjà mesuré par le moteur de liaison (`clesFeuilleDeRoute` donne
 * `compteImputation` pour clé principale, égale au code OTP sur 92 % des
 * lignes) et par le rapprochement du 23/08/2026 (otp → fiche → intitulé). Le
 * Work Program, l'année et le budget ne départagent rien à eux seuls : ils
 * confirment ou infirment ce que les deux premiers disent.
 */
export const POIDS: Record<CritereId, number> = {
  otp: 5,
  intitule: 4,
  fiche: 3,
  champ: 2,
  budget: 2,
  wp: 1,
  annee: 1,
  dates: 1,
}

/** Au-dessus : le candidat est retenu sans confirmation. */
export const SEUIL_AUTOMATIQUE = 0.85
/** Au-dessus : le candidat est proposé, à confirmer à la main. */
export const SEUIL_PROPOSITION = SEUIL_SUGGESTION
/**
 * Écart minimal entre le premier et le second candidat pour qu'un choix
 * automatique soit tenu pour non ambigu. Deux candidats à 0,90 et 0,88 ne se
 * départagent pas : on ne tranche pas, on propose.
 */
export const MARGE_UNICITE = 0.1
/** Écart relatif en deçà duquel deux montants sont tenus pour le même. */
export const TOLERANCE_MONTANT = 0.02
/** Nombre de candidats conservés pour l'affichage d'une ligne à confirmer. */
export const CANDIDATS_AFFICHES = 6

/**
 * Devise dans laquelle les colonnes de la feuille de route sont comptées.
 *
 * Le classeur source compte en KUSD (`bu26ServKusd`, `pdc02_2026_kusd`) sans
 * porter de devise. Comparer ces montants à ceux d'une ligne navette libellée
 * en euros ou en francs CFA ferait diverger un critère pour une raison qui n'a
 * rien à voir avec l'identité de l'affaire : le critère budget n'est donc
 * évalué que pour les lignes navette en dollars, et laissé non évalué ailleurs
 * (ce qui ne pénalise pas le candidat — cf. `scoreDepuisCriteres`).
 */
export const DEVISE_FEUILLE_DE_ROUTE = 'USD'

// ---------------------------------------------------------------------------
// Critères

export type CritereId = 'otp' | 'intitule' | 'fiche' | 'champ' | 'budget' | 'wp' | 'annee' | 'dates'

export const CRITERE_LABELS: Record<CritereId, string> = {
  otp: 'Imputation (OTP)',
  intitule: 'Intitulé',
  fiche: 'Fiche projet',
  champ: 'Champ (site)',
  budget: 'Budget',
  wp: 'Work Program',
  annee: 'Année du budget',
  dates: 'Dates',
}

export interface Critere {
  id: CritereId
  poids: number
  /**
   * Part de concordance, de 0 (diverge) à 1 (concorde) — l'intitulé prend les
   * valeurs intermédiaires (similarité de Jaccard).
   *
   * `null` = **non évaluable** : l'un des deux côtés ne porte pas la valeur.
   * Un critère non évaluable est retiré du dénominateur au lieu de compter
   * pour 0 — sinon une ligne qui ne renseigne ni l'année ni le budget serait
   * pénalisée pour ce qu'elle ne dit pas, et aucune ne passerait le seuil.
   */
  part: number | null
}

const critere = (id: CritereId, part: number | null): Critere => ({ id, poids: POIDS[id], part })

/** Moyenne des parts, pondérée, sur les seuls critères évaluables. */
export function scoreDepuisCriteres(criteres: Critere[]): number {
  const evalues = criteres.filter((c) => c.part !== null)
  const total = evalues.reduce((s, c) => s + c.poids, 0)
  if (total === 0) return 0
  return evalues.reduce((s, c) => s + c.poids * (c.part as number), 0) / total
}

/** Égalité stricte — non évaluable dès qu'une des deux valeurs manque. */
function partEgalite(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null
  return a === b ? 1 : 0
}

/**
 * Ressemblance de deux intitulés : 1 s'ils sont identiques une fois
 * normalisés (préfixe de champ retiré), sinon la similarité de Jaccard sur
 * leurs tokens significatifs — la mesure qu'utilise déjà `Resolveur.suggerer`.
 */
export function partIntitule(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  if (a === b) return 1
  return jaccard(tokensSignificatifs(a), tokensSignificatifs(b))
}

/** Deux montants concordent en deçà de `TOLERANCE_MONTANT` d'écart relatif. */
export function partMontant(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null
  const reference = Math.max(Math.abs(a), Math.abs(b))
  // Deux zéros ne disent rien : une colonne vide des deux côtés n'est pas une
  // concordance, c'est une absence d'information.
  if (reference === 0) return null
  return Math.abs(a - b) / reference <= TOLERANCE_MONTANT ? 1 : 0
}

/** Work Program d'une ligne de feuille de route — `null` si non renseigné. */
export function wpFeuilleDeRoute(fdr: ProjetFeuilleDeRoute): boolean | null {
  const valeur = normaliser(fdr.wp)
  if (valeur === 'OUI') return true
  if (valeur === 'NON') return false
  return null
}

const part = (criteres: Critere[], id: CritereId): number | null =>
  criteres.find((c) => c.id === id)?.part ?? null

// ---------------------------------------------------------------------------
// Candidats

export interface Candidat<T> {
  cible: T
  criteres: Critere[]
  score: number
  /**
   * Motif d'exclusion, `null` si le candidat est retenu dans la comparaison.
   * Un candidat écarté ne concourt pas et n'est pas proposé.
   */
  ecarte: string | null
}

/**
 * Le champ (site) est un discriminant, pas un critère de plus.
 *
 * Règle §2.3 du document de liaison, déjà appliquée par `suggestionsNavette` :
 * deux affaires de même intitulé sur deux champs différents sont deux affaires
 * distinctes. La seule chose qui passe outre est une imputation identique — un
 * code OTP ne se partage pas, un champ divergent y est une erreur de saisie,
 * pas une seconde affaire.
 */
function motifExclusion(criteres: Critere[]): string | null {
  if (part(criteres, 'champ') === 0 && part(criteres, 'otp') !== 1) return 'champ (site) différent'
  return null
}

function versCandidat<T>(cible: T, criteres: Critere[]): Candidat<T> {
  return { cible, criteres, score: scoreDepuisCriteres(criteres), ecarte: motifExclusion(criteres) }
}

/** Score d'une ligne navette pour une ligne de feuille de route. */
export function scorerNavette(fdr: ProjetFeuilleDeRoute, ligne: LigneNavette): Candidat<LigneNavette> {
  // Une ligne sans devise est comptée dans l'unité du classeur, comme le fait
  // `versLigneFront` (repli USD) : le critère reste comparable.
  const budgetComparable = (ligne.devise ?? DEVISE_FEUILLE_DE_ROUTE) === DEVISE_FEUILLE_DE_ROUTE
  return versCandidat(ligne, [
    critere('otp', partEgalite(otpFeuilleDeRoute(fdr), normaliser(ligne.codeOTP))),
    critere('intitule', partIntitule(libelleComparable(fdr.projet), libelleComparable(ligne.libelle))),
    critere('fiche', partEgalite(fdr.projetId ?? null, ligne.projetId ?? null)),
    critere('champ', partEgalite(normaliser(fdr.champs), normaliser(ligne.champ))),
    critere('budget', budgetComparable ? partMontant(fdr.bu26ServKusd, ligne.cycles.BU.serv) : null),
    // Le Work Program **n'est pas un critère ici**, contrairement à l'étage
    // fiche projet : `versLigneFront` (NavetteContext) rend `workProgram: false`
    // dès que le champ est absent, ce qui est le cas des 102 lignes reprises du
    // classeur. Une divergence n'y dirait donc rien — elle pénaliserait toutes
    // les lignes WP de la feuille de route pour une valeur par défaut.
    critere('annee', partEgalite(fdr.anneeBu, ligne.anneeBudget ?? null)),
  ])
}

/** Score d'une fiche projet pour une ligne de feuille de route. */
export function scorerProjet(fdr: ProjetFeuilleDeRoute, projet: Projet): Candidat<Projet> {
  const otpFdr = otpFeuilleDeRoute(fdr)
  // Une fiche porte plusieurs comptes d'imputation depuis le 22/08/2026 : le
  // critère répond dès que l'un d'eux correspond.
  const otpsProjet = [projet.codeOTP, ...(projet.codesOTP ?? [])]
    .map((o) => normaliser(o))
    .filter((o): o is string => o !== null)
  const otp = otpFdr === null || otpsProjet.length === 0 ? null : otpsProjet.includes(otpFdr) ? 1 : 0

  const datesRenseignees = fdr.dateDebut && fdr.dateFin && projet.dateDebut && projet.dateFin
  return versCandidat(projet, [
    critere('otp', otp),
    critere('intitule', partIntitule(libelleComparable(fdr.projet), libelleComparable(projet.nom))),
    critere('champ', partEgalite(normaliser(fdr.champs), normaliser(projet.champ))),
    critere('wp', partEgalite(wpFeuilleDeRoute(fdr), projet.workProgram)),
    critere(
      'dates',
      datesRenseignees ? (fdr.dateDebut === projet.dateDebut && fdr.dateFin === projet.dateFin ? 1 : 0) : null
    ),
  ])
}

// ---------------------------------------------------------------------------
// Décision

export type DecisionMatching =
  /** La ligne porte déjà le lien : jamais réécrit. */
  | 'deja-lie'
  /** Une clé forte, ou un score franc et unique : sera écrit. */
  | 'automatique'
  /** Un candidat probable, mais rien d'assez net : attend un choix. */
  | 'a-confirmer'
  /** Aucun candidat au-dessus du seuil de proposition. */
  | 'aucun'
  /** Hors du périmètre analysé (ligne non Work Program). */
  | 'hors-perimetre'

export type MethodeMatching = 'otp' | 'intitule' | 'fiche' | 'navette' | 'score'

export const METHODE_MATCHING_LABELS: Record<MethodeMatching, string> = {
  otp: 'imputation identique',
  intitule: 'intitulé identique',
  fiche: 'même fiche projet',
  navette: 'via la ligne navette',
  score: 'faisceau de critères',
}

export interface Choix<T> {
  decision: DecisionMatching
  /** Candidat retenu (décision automatique) ou proposé (à confirmer). */
  retenu: Candidat<T> | null
  methode: MethodeMatching | null
  /** Plusieurs candidats se valent — rien n'est écrit sans confirmation. */
  ambigu: boolean
  /** Candidats les mieux placés, pour le choix à la main. */
  candidats: Candidat<T>[]
  /**
   * Score du mieux placé, **même sous le seuil** — c'est ce qui permet à
   * l'écran de dire pourquoi une ligne n'a aucun candidat (0,43 n'est pas
   * 0,00 : le premier est une variation d'intitulé, le second une affaire
   * absente de la navette).
   */
  meilleurScore: number
}

/** Le mieux placé, s'il devance le suivant d'au moins `MARGE_UNICITE`. */
function detacher<T>(candidats: Candidat<T>[]): { retenu: Candidat<T> | null; ambigu: boolean } {
  if (candidats.length === 0) return { retenu: null, ambigu: false }
  const tri = [...candidats].sort((a, b) => b.score - a.score)
  if (tri.length === 1 || tri[0].score - tri[1].score >= MARGE_UNICITE) return { retenu: tri[0], ambigu: false }
  return { retenu: null, ambigu: true }
}

/**
 * Décide, pour une liste de candidats déjà scorés.
 *
 * Les clés fortes passent avant le score : une imputation identique, un
 * intitulé identique, une fiche projet commune. C'est ce que faisait le
 * rapprochement du 23/08/2026, et il n'y a pas de raison de le défaire — le
 * score sert à ce qu'il ne savait pas faire, rapprocher deux enregistrements
 * qui ne coïncident exactement sur *aucun* critère mais se ressemblent sur
 * tous. Une clé forte portée par plusieurs candidats ne tranche pas d'elle-
 * même : c'est alors le score qui départage, et à défaut on propose.
 */
export function decider<T>(candidats: Candidat<T>[]): Choix<T> {
  const enLice = candidats.filter((c) => c.ecarte === null)
  const tri = [...enLice].sort((a, b) => b.score - a.score)
  const proposes = tri.slice(0, CANDIDATS_AFFICHES)

  const meilleurScore = tri[0]?.score ?? 0

  const etapes: [MethodeMatching, (c: Candidat<T>) => boolean][] = [
    ['otp', (c) => part(c.criteres, 'otp') === 1],
    // Un intitulé identique ne suffit plus si l'imputation dit le contraire :
    // deux signaux forts qui se contredisent, c'est un cas à regarder.
    ['intitule', (c) => part(c.criteres, 'intitule') === 1 && part(c.criteres, 'otp') !== 0],
    ['fiche', (c) => part(c.criteres, 'fiche') === 1],
  ]

  for (const [methode, filtre] of etapes) {
    const liste = tri.filter(filtre)
    if (liste.length === 0) continue
    const { retenu, ambigu } = detacher(liste)
    if (retenu) return { decision: 'automatique', retenu, methode, ambigu: false, candidats: proposes, meilleurScore }
    return {
      decision: 'a-confirmer',
      retenu: null,
      methode,
      ambigu,
      candidats: liste.slice(0, CANDIDATS_AFFICHES),
      meilleurScore,
    }
  }

  // Un candidat dont une clé forte concorde est proposé même sous le seuil :
  // c'est le cas des signaux qui se contredisent (intitulé identique, mais
  // imputation différente), écarté des étapes ci-dessus. Le score y est bas
  // **parce que** deux critères s'opposent — c'est précisément ce qu'il faut
  // faire regarder, pas ce qu'il faut taire.
  const cleForte = (c: Candidat<T>) =>
    part(c.criteres, 'otp') === 1 || part(c.criteres, 'intitule') === 1 || part(c.criteres, 'fiche') === 1
  const proposables = tri.filter((c) => c.score >= SEUIL_PROPOSITION || cleForte(c))

  if (proposables.length === 0) {
    return { decision: 'aucun', retenu: null, methode: null, ambigu: false, candidats: [], meilleurScore }
  }

  const { retenu, ambigu } = detacher(proposables)
  if (retenu && retenu.score >= SEUIL_AUTOMATIQUE) {
    return { decision: 'automatique', retenu, methode: 'score', ambigu: false, candidats: proposes, meilleurScore }
  }
  return {
    decision: 'a-confirmer',
    retenu: proposables[0],
    methode: 'score',
    ambigu,
    candidats: proposables.slice(0, CANDIDATS_AFFICHES),
    meilleurScore,
  }
}

// ---------------------------------------------------------------------------
// Analyse

export interface LigneMatching {
  fdr: ProjetFeuilleDeRoute
  /** La ligne entre-t-elle dans le périmètre analysé (Work Program) ? */
  dansPerimetre: boolean
  navette: Choix<LigneNavette>
  projet: Choix<Projet>
}

export interface MatchingPortefeuille {
  lignes: LigneMatching[]
  lignesNavette: LigneNavette[]
  projets: Projet[]
  /** Fiches projet qu'aucune ligne de feuille de route ne représenterait. */
  projetsSansLigne: Projet[]
  perimetre: { wpSeulement: boolean; horsPerimetre: number }
  /**
   * Ce que l'analyse a reçu, affiché tel quel.
   *
   * Sans ça, un rapprochement vide ne se distingue pas d'un chargement qui a
   * échoué : une collection inaccessible (règles non déployées) rend une liste
   * vide, et l'écran dirait « rien à lier » au lieu de « rien n'est arrivé ».
   */
  entrees: { lignesFdr: number; lignesNavette: number; projets: number; wpOui: number; avecImputation: number }
  resume: {
    total: number
    analysees: number
    navetteDejaLiees: number
    navetteAutomatiques: number
    navetteAConfirmer: number
    navetteAucun: number
    projetDejaLiees: number
    projetAutomatiques: number
    projetAConfirmer: number
    projetAucun: number
    lignesNavetteAPourvoir: number
    projetsSansLigne: number
  }
}

export interface OptionsMatching {
  lignesFdr: ProjetFeuilleDeRoute[]
  lignesNavette: LigneNavette[]
  projets: Projet[]
  /** Périmètre demandé : les lignes Work Program de la feuille de route. */
  wpSeulement?: boolean
  /**
   * Cascade du moteur de liaison, en dernier recours pour la fiche projet —
   * c'est celle que le tableau de la feuille de route utilise déjà pour
   * afficher sa colonne « Fiche projet ». Passée en paramètre pour que ce
   * module reste vérifiable sans contexte React.
   */
  resoudreProjet?: (p: ProjetFeuilleDeRoute) => string | null
}

const CHOIX_VIDE = <T,>(decision: DecisionMatching): Choix<T> => ({
  decision,
  retenu: null,
  methode: null,
  ambigu: false,
  candidats: [],
  meilleurScore: 0,
})

/**
 * Rapproche les trois modules sans rien écrire.
 *
 * Étage 1 — chaque ligne de feuille de route du périmètre cherche sa ligne
 * navette. Étage 2 — chaque ligne cherche sa fiche projet, en héritant d'abord
 * de celle que porte la ligne navette retenue : c'est le lien le plus sûr,
 * puisqu'il a déjà été posé à la main d'un côté.
 */
export function analyserMatching({
  lignesFdr,
  lignesNavette,
  projets,
  wpSeulement = true,
  resoudreProjet,
}: OptionsMatching): MatchingPortefeuille {
  const projetsParId = new Map(projets.map((p) => [p.id, p]))

  const lignes: LigneMatching[] = lignesFdr.map((fdr) => {
    const dansPerimetre = !wpSeulement || wpFeuilleDeRoute(fdr) === true
    if (!dansPerimetre) {
      return {
        fdr,
        dansPerimetre,
        navette: CHOIX_VIDE<LigneNavette>('hors-perimetre'),
        projet: CHOIX_VIDE<Projet>('hors-perimetre'),
      }
    }

    // --- Étage 1 : la ligne navette d'origine ------------------------------
    let navette: Choix<LigneNavette>
    if (fdr.ligneNavetteId) {
      const dejaLiee = lignesNavette.find((l) => l.id === fdr.ligneNavetteId) ?? null
      // Un lien déjà posé fait foi, même si la ligne navette a disparu depuis :
      // le corriger d'office effacerait une décision prise à la main.
      navette = {
        decision: 'deja-lie',
        retenu: dejaLiee ? versCandidat(dejaLiee, []) : null,
        methode: null,
        ambigu: false,
        candidats: [],
        meilleurScore: 1,
      }
    } else {
      navette = decider(lignesNavette.map((l) => scorerNavette(fdr, l)))
    }

    // --- Étage 2 : la fiche projet -----------------------------------------
    let projet: Choix<Projet>
    const heritee = navette.retenu?.cible.projetId
    if (fdr.projetId) {
      const dejaLiee = projetsParId.get(fdr.projetId) ?? null
      projet = {
        decision: 'deja-lie',
        retenu: dejaLiee ? versCandidat(dejaLiee, []) : null,
        methode: null,
        ambigu: false,
        candidats: [],
        meilleurScore: 1,
      }
    } else if (navette.decision !== 'a-confirmer' && heritee && projetsParId.has(heritee)) {
      // La fiche que désigne la ligne navette retenue : lien explicite d'un
      // côté, rien à deviner. Pas d'héritage tant que la ligne navette
      // elle-même n'est pas confirmée — un lien probable ne fonde pas un lien
      // certain.
      projet = {
        decision: 'automatique',
        retenu: versCandidat(projetsParId.get(heritee) as Projet, []),
        methode: 'navette',
        ambigu: false,
        candidats: [],
        meilleurScore: 1,
      }
    } else {
      projet = decider(projets.map((p) => scorerProjet(fdr, p)))
      if (projet.decision === 'aucun') {
        const cascade = resoudreProjet?.(fdr) ?? null
        const trouve = cascade ? projetsParId.get(cascade) : undefined
        if (trouve) {
          projet = {
            decision: 'automatique',
            retenu: versCandidat(trouve, []),
            methode: 'score',
            ambigu: false,
            candidats: [],
            meilleurScore: 1,
          }
        }
      }
    }

    return { fdr, dansPerimetre, navette, projet }
  })

  // Fiches projet qu'aucune ligne ne représente — ni déjà, ni après écriture.
  const couvertes = new Set(
    lignes
      .filter((l) => l.projet.decision === 'deja-lie' || l.projet.decision === 'automatique')
      .map((l) => l.projet.retenu?.cible.id)
      .filter((id): id is string => !!id)
  )
  const projetsSansLigne = projets.filter((p) => !couvertes.has(p.id))

  const compter = (predicat: (l: LigneMatching) => boolean) => lignes.filter(predicat).length
  const analysees = compter((l) => l.dansPerimetre)

  // Lignes navette qui recevraient leur fiche projet : celles qu'on rattache
  // et qui n'en portent pas, alors que la ligne de feuille de route la connaît.
  const navetteAPourvoir = new Set(
    lignes
      .filter(
        (l) =>
          l.navette.decision === 'automatique' &&
          !l.navette.retenu?.cible.projetId &&
          (l.projet.decision === 'deja-lie' || l.projet.decision === 'automatique')
      )
      .map((l) => l.navette.retenu?.cible.id)
      .filter((id): id is string => !!id)
  )

  return {
    lignes,
    lignesNavette,
    projets,
    projetsSansLigne,
    perimetre: { wpSeulement, horsPerimetre: compter((l) => !l.dansPerimetre) },
    entrees: {
      lignesFdr: lignesFdr.length,
      lignesNavette: lignesNavette.length,
      projets: projets.length,
      wpOui: lignesFdr.filter((p) => wpFeuilleDeRoute(p) === true).length,
      avecImputation: lignesFdr.filter((p) => otpFeuilleDeRoute(p) !== null).length,
    },
    resume: {
      total: lignes.length,
      analysees,
      navetteDejaLiees: compter((l) => l.navette.decision === 'deja-lie'),
      navetteAutomatiques: compter((l) => l.navette.decision === 'automatique'),
      navetteAConfirmer: compter((l) => l.navette.decision === 'a-confirmer'),
      navetteAucun: compter((l) => l.navette.decision === 'aucun'),
      projetDejaLiees: compter((l) => l.projet.decision === 'deja-lie'),
      projetAutomatiques: compter((l) => l.projet.decision === 'automatique'),
      projetAConfirmer: compter((l) => l.projet.decision === 'a-confirmer'),
      projetAucun: compter((l) => l.projet.decision === 'aucun'),
      lignesNavetteAPourvoir: navetteAPourvoir.size,
      projetsSansLigne: projetsSansLigne.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Des décisions aux écritures

/** Choix faits à la main sur les lignes que l'algorithme refuse de trancher. */
export interface ChoixManuels {
  /** id de ligne de feuille de route → id de la ligne navette choisie. */
  navette: Record<number, string>
  /** id de ligne de feuille de route → id de la fiche projet choisie. */
  projet: Record<number, string>
}

export const AUCUN_CHOIX: ChoixManuels = { navette: {}, projet: {} }

export interface PatchsPortefeuille {
  /** Mises à jour de `feuille_de_route`. */
  fdr: { id: number; patch: { ligneNavetteId?: string; projetId?: string } }[]
  /** Mises à jour de `lignes_navette` (leur `projetId`). */
  navette: { ligneId: string; projetId: string }[]
  /** Lignes de feuille de route à créer pour les fiches qui n'en ont aucune. */
  creations: ProjetFeuilleDeRoute[]
}

/**
 * Ce qui serait écrit — pure, c'est elle qui décide, elle doit être vérifiable
 * sans Firestore.
 *
 * Un lien déjà posé n'est jamais réécrit : `patch` ne porte que les champs
 * absents de la ligne. Une ligne restée « à confirmer » n'entre ici que si un
 * choix manuel la désigne.
 */
export function construirePatchs(
  analyse: MatchingPortefeuille,
  choix: ChoixManuels = AUCUN_CHOIX,
  { creerLignesManquantes = false }: { creerLignesManquantes?: boolean } = {},
  maintenant = Date.now()
): PatchsPortefeuille {
  const navetteParId = new Map(analyse.lignesNavette.map((l) => [l.id, l]))
  const projetsParId = new Map(analyse.projets.map((p) => [p.id, p]))

  const fdr: PatchsPortefeuille['fdr'] = []
  const navette = new Map<string, string>()
  const couvertes = new Set<string>()

  for (const ligne of analyse.lignes) {
    if (!ligne.dansPerimetre) continue

    const idNavette =
      ligne.fdr.ligneNavetteId ??
      (ligne.navette.decision === 'automatique' ? ligne.navette.retenu?.cible.id : undefined) ??
      choix.navette[ligne.fdr.id]

    const idProjet =
      ligne.fdr.projetId ??
      (ligne.projet.decision === 'automatique' ? ligne.projet.retenu?.cible.id : undefined) ??
      choix.projet[ligne.fdr.id] ??
      // Une ligne navette choisie à la main apporte sa fiche projet avec elle :
      // c'est le seul moment où les deux sont sous les yeux.
      (idNavette ? navetteParId.get(idNavette)?.projetId : undefined)

    const patch: { ligneNavetteId?: string; projetId?: string } = {}
    if (!ligne.fdr.ligneNavetteId && idNavette && navetteParId.has(idNavette)) patch.ligneNavetteId = idNavette
    if (!ligne.fdr.projetId && idProjet && projetsParId.has(idProjet)) patch.projetId = idProjet
    if (Object.keys(patch).length > 0) fdr.push({ id: ligne.fdr.id, patch })

    if (idProjet && projetsParId.has(idProjet)) {
      couvertes.add(idProjet)
      // Retour vers la navette : sans lui, elle continuerait d'afficher « non
      // liée » une affaire dont la feuille de route connaît la fiche.
      const ligneNavette = idNavette ? navetteParId.get(idNavette) : undefined
      if (ligneNavette && !ligneNavette.projetId) navette.set(ligneNavette.id, idProjet)
    }
  }

  const orphelines = analyse.projets.filter((p) => !couvertes.has(p.id))
  const ids = prochainsIdsFdr(orphelines.length, maintenant)
  const creations = creerLignesManquantes
    ? orphelines.map((projet, i) => {
        // La ligne navette de cette fiche, quand une seule la désigne : sans
        // ambiguïté, la ligne créée hérite de son BU et de son PDC.
        const candidates = analyse.lignesNavette.filter((l) => l.projetId === projet.id)
        return ligneFdrDepuisProjet(projet, candidates.length === 1 ? candidates[0] : null, ids[i])
      })
    : []

  return {
    fdr,
    navette: [...navette].map(([ligneId, projetId]) => ({ ligneId, projetId })),
    creations,
  }
}

// ---------------------------------------------------------------------------
// Écriture

export interface ResultatMatching {
  lignesFdrLiees: number
  lignesNavetteLiees: number
  lignesFdrCreees: number
  creees: ProjetFeuilleDeRoute[]
}

/**
 * Applique les patchs — les seules écritures du module.
 *
 * `lignes_navette` est en `allow update: if estAdmin()` : sans droits admin, la
 * partie navette échoue. D'où l'écran réservé aux admins, comme les migrations
 * de Paramètres › Maintenance dont ce lot reprend le parcours (analyser, puis
 * appliquer après confirmation).
 */
export async function appliquerPatchs(patchs: PatchsPortefeuille): Promise<ResultatMatching> {
  for (const lot of enLots(patchs.fdr)) {
    const batch = writeBatch(db)
    for (const { id, patch } of lot) batch.update(doc(db, COLLECTIONS.feuilleDeRoute, String(id)), patch)
    await batch.commit()
  }

  for (const lot of enLots(patchs.navette)) {
    const batch = writeBatch(db)
    for (const { ligneId, projetId } of lot) batch.update(doc(db, COLLECTIONS.lignesNavette, ligneId), { projetId })
    await batch.commit()
  }

  for (const lot of enLots(patchs.creations)) {
    const batch = writeBatch(db)
    for (const ligne of lot) batch.set(doc(db, COLLECTIONS.feuilleDeRoute, String(ligne.id)), ligne)
    await batch.commit()
  }

  return {
    lignesFdrLiees: patchs.fdr.length,
    lignesNavetteLiees: patchs.navette.length,
    lignesFdrCreees: patchs.creations.length,
    creees: patchs.creations,
  }
}
