// Rapprochement du portefeuille : Navette ↔ Feuille de route ↔ Fiche projet
// (23/08/2026, demande explicite « je veux lier tous les projets qui sont dans
// la feuille de route en fonction de la navette, tout ce qui est dans les
// projets sera lié à la feuille de route »).
//
// Ce que l'application savait faire avant : poser les deux liens **au moment
// où** on crée une fiche projet depuis une ligne navette
// (`FeuilleDeRouteContext.synchroniserDepuisNavette`, appelé par NavettePage).
// Ce qu'elle ne savait pas faire : rattraper l'existant. Les 84 lignes de
// feuille de route et les lignes navette reprises des classeurs n'ont jamais
// traversé ce chemin — elles ne portent donc ni `ligneNavetteId` ni
// `projetId`, et rien dans l'écran ne permettait de les rapprocher après coup.
// Conséquences visibles : `calculerLigne` ne relit BU/PDC sur la navette que
// s'il y a un `ligneNavetteId` (sinon la feuille de route reste figée sur la
// valeur du classeur, même après une révision validée), et la colonne « Fiche
// projet » reste vide.
//
// Deux principes, repris des migrations (lib/migrations.ts) :
//   - **rien n'est deviné** : un rapprochement ambigu (deux lignes navette
//     candidates pour une même ligne de feuille de route) n'est jamais
//     appliqué, il est signalé. C'est la règle du moteur de liaison — le flou
//     passe par une confirmation, jamais par une écriture automatique ;
//   - **idempotence** : un lien déjà posé n'est jamais réécrit, y compris s'il
//     pointe ailleurs que ce que le rapprochement proposerait. Relancer ne
//     change rien.

import { collection, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestoreCollections'
import { SEUIL_SUGGESTION, jaccard, normaliser, tokensSignificatifs } from './liaison'
import type { ProjetFeuilleDeRoute } from '../types/feuilleDeRoute'
import { EMPTY_PROJET_FEUILLE_DE_ROUTE, SERVICE_LEADERS_FEUILLE_DE_ROUTE } from '../types/feuilleDeRoute'
import type { LigneNavette } from '../types/navette'
import { totalBudget } from '../types/navette'
import type { Projet, ServiceClient } from '../types/project'
import { enLots } from './migrations'

// ---------------------------------------------------------------------------
// Clés de rapprochement

// Les libellés navette sont préfixés par le champ sur 62 des 102 lignes
// mesurées (« AGM: Remplacement… ») là où la feuille de route porte le seul
// intitulé. Comparer les deux bruts raterait ces lignes ; le préfixe est donc
// retiré des deux côtés — c'est le même parser que `extraireClesLibelle`
// (lib/liaison.ts), réduit à ce dont on a besoin ici.
const RE_PREFIXE_CHAMP = /^[A-Z]{2,5}\s*:\s*/

/** Libellé comparable entre modules : normalisé, sans le préfixe de champ. */
export function libelleComparable(valeur: string | null | undefined): string | null {
  const norme = normaliser(valeur)
  return norme ? norme.replace(RE_PREFIXE_CHAMP, '').trim() || null : null
}

/**
 * Code d'imputation d'une ligne de feuille de route.
 *
 * `compteImputation` d'abord : c'est la colonne que `clesFeuilleDeRoute`
 * (lib/liaisonCles.ts) donne déjà pour clé principale, mesurée à 92 % égale au
 * code OTP. `otp` ne sert qu'à défaut.
 */
export function otpFeuilleDeRoute(p: ProjetFeuilleDeRoute): string | null {
  return normaliser(p.compteImputation) ?? normaliser(p.otp)
}

// ---------------------------------------------------------------------------
// Résultat du rapprochement

/** Comment un lien a été retrouvé — affiché ligne par ligne avant écriture. */
export type MethodeRapprochement =
  | 'deja-lie'
  /** Code OTP / compte d'imputation identique. */
  | 'otp'
  /** Les deux enregistrements désignent déjà la même fiche projet. */
  | 'fiche-projet'
  /** Intitulés identiques (préfixe de champ retiré). */
  | 'nom'
  /** Hérité de la ligne navette rapprochée juste avant. */
  | 'navette'
  /** Cascade du moteur de liaison (otp → avis → ot → po → nom exact). */
  | 'cascade'

export const METHODE_RAPPROCHEMENT_LABELS: Record<MethodeRapprochement, string> = {
  'deja-lie': 'déjà lié',
  otp: 'code OTP identique',
  'fiche-projet': 'même fiche projet',
  nom: 'intitulé identique',
  navette: 'via la ligne navette',
  cascade: 'cascade de liaison',
}

export interface SuggestionNavette {
  ligne: LigneNavette
  /** Similarité de Jaccard sur les tokens significatifs des intitulés (0..1). */
  score: number
}

export interface RapprochementLigneFdr {
  fdr: ProjetFeuilleDeRoute
  /** Ligne navette retenue — `null` si aucune ne correspond, ou plusieurs. */
  ligneNavette: LigneNavette | null
  methodeNavette: MethodeRapprochement | null
  /** Candidates concurrentes : présentes, rien n'est écrit pour cette ligne. */
  navetteAmbigue: LigneNavette[]
  /**
   * Lignes navette les plus proches quand aucun critère exact n'a répondu —
   * une ligne de feuille de route vient forcément d'une ligne navette
   * (23/08/2026 : « pour avoir un item dans feuille de route, elle doit
   * provenir de la navette »), donc ce qui reste non rapproché est une
   * variation d'intitulé à trancher à la main, pas une ligne sans origine.
   * Jamais appliquées automatiquement : c'est la règle du moteur de liaison.
   */
  suggestions: SuggestionNavette[]
  projetId: string | null
  methodeProjet: MethodeRapprochement | null
  /** Ce qui serait écrit sur le document `feuille_de_route`. */
  patchFdr: { ligneNavetteId?: string; projetId?: string }
  /** Ce qui serait écrit sur le document `lignes_navette` (son `projetId`). */
  patchNavette: { ligneId: string; projetId: string } | null
}

export interface ProjetSansLigneFdr {
  projet: Projet
  /** Ligne navette de cette fiche, quand elle en a une (`ligne.projetId`). */
  ligneNavette: LigneNavette | null
}

export interface RapprochementPortefeuille {
  lignes: RapprochementLigneFdr[]
  /** Fiches projet qu'aucune ligne de feuille de route ne représente. */
  projetsSansLigne: ProjetSansLigneFdr[]
  /** Décomptes affichés avant écriture. */
  resume: {
    totalFdr: number
    dejaLieesNavette: number
    aLierNavette: number
    ambigues: number
    sansCorrespondance: number
    dejaLieesProjet: number
    aLierProjet: number
    lignesNavetteAPourvoir: number
    projetsSansLigne: number
    /** Lignes non rapprochées pour lesquelles une ligne navette est proposée. */
    avecSuggestion: number
    /**
     * Lignes non rapprochées et sans proposition. Selon la règle métier, elles
     * ne devraient pas exister : une ligne de feuille de route vient d'une
     * ligne navette. Ce sont donc des données à corriger — un intitulé trop
     * éloigné, ou une ligne navette qui manque réellement.
     */
    sansOrigine: number
  }
}

/**
 * Lignes navette dont l'intitulé ressemble le plus à celui d'une ligne de
 * feuille de route.
 *
 * Même mesure que les suggestions du moteur de liaison (`Resolveur.suggerer`)
 * — Jaccard sur les tokens significatifs, au-dessus du même seuil — et même
 * usage : proposées, jamais appliquées. Le champ (site) sert de garde-fou
 * quand les deux côtés le portent : deux affaires de même intitulé sur deux
 * champs différents sont deux affaires distinctes (règle §2.3).
 */
export function suggestionsNavette(
  fdr: ProjetFeuilleDeRoute,
  tokensNavette: { ligne: LigneNavette; tokens: Set<string> }[],
  seuil = SEUIL_SUGGESTION
): SuggestionNavette[] {
  const nom = libelleComparable(fdr.projet)
  if (!nom) return []
  const tokens = tokensSignificatifs(nom)
  const champFdr = normaliser(fdr.champs)
  return tokensNavette
    .filter(({ ligne }) => {
      const champNavette = normaliser(ligne.champ)
      return !champFdr || !champNavette || champFdr === champNavette
    })
    .map(({ ligne, tokens: autres }) => ({ ligne, score: jaccard(tokens, autres) }))
    .filter((s) => s.score >= seuil)
    .sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------
// Le rapprochement lui-même — pur, c'est lui qui décide de ce qui sera écrit

/**
 * Rapproche les trois modules sans rien écrire.
 *
 * `resoudreProjet` est le moteur de liaison de l'application, passé en
 * paramètre pour que cette fonction reste vérifiable sans contexte React :
 * c'est le dernier recours, quand ni le lien explicite ni la ligne navette ne
 * désignent de fiche.
 */
export function rapprocherPortefeuille({
  lignesFdr,
  lignesNavette,
  projets,
  resoudreProjet,
}: {
  lignesFdr: ProjetFeuilleDeRoute[]
  lignesNavette: LigneNavette[]
  projets: Projet[]
  resoudreProjet?: (p: ProjetFeuilleDeRoute) => string | null
}): RapprochementPortefeuille {
  const projetsExistants = new Set(projets.map((p) => p.id))
  const navetteParId = new Map(lignesNavette.map((l) => [l.id, l]))

  // Index multivalués : deux lignes navette peuvent porter le même intitulé.
  // On garde toutes les candidates pour pouvoir refuser d'écrire plutôt que
  // d'en choisir une au hasard.
  const parOtp = new Map<string, LigneNavette[]>()
  const parLibelle = new Map<string, LigneNavette[]>()
  const parProjet = new Map<string, LigneNavette[]>()
  const ajouter = (index: Map<string, LigneNavette[]>, cle: string | null, ligne: LigneNavette) => {
    if (!cle) return
    const liste = index.get(cle)
    if (liste) liste.push(ligne)
    else index.set(cle, [ligne])
  }
  for (const ligne of lignesNavette) {
    ajouter(parOtp, normaliser(ligne.codeOTP), ligne)
    ajouter(parLibelle, libelleComparable(ligne.libelle), ligne)
    ajouter(parProjet, ligne.projetId ?? null, ligne)
  }

  // Tokens des intitulés navette, calculés une fois : les suggestions les
  // comparent à chaque ligne de feuille de route restée sans rapprochement.
  const tokensNavette = lignesNavette.map((ligne) => ({
    ligne,
    tokens: tokensSignificatifs(libelleComparable(ligne.libelle) ?? ''),
  }))

  const lignes: RapprochementLigneFdr[] = lignesFdr.map((fdr) => {
    // --- Ligne navette -----------------------------------------------------
    let ligneNavette: LigneNavette | null = null
    let methodeNavette: MethodeRapprochement | null = null
    let navetteAmbigue: LigneNavette[] = []

    const deja = fdr.ligneNavetteId ? navetteParId.get(fdr.ligneNavetteId) : undefined
    if (fdr.ligneNavetteId) {
      // Un lien déjà posé fait foi, même si la ligne navette a disparu depuis :
      // le corriger d'office effacerait une décision prise à la main.
      ligneNavette = deja ?? null
      methodeNavette = 'deja-lie'
    } else {
      const candidats: [MethodeRapprochement, LigneNavette[]][] = [
        ['otp', parOtp.get(otpFeuilleDeRoute(fdr) ?? '') ?? []],
        ['fiche-projet', fdr.projetId ? (parProjet.get(fdr.projetId) ?? []) : []],
        ['nom', parLibelle.get(libelleComparable(fdr.projet) ?? '') ?? []],
      ]
      const nonVides = candidats.filter(([, trouves]) => trouves.length > 0)
      for (const [methode, trouves] of nonVides) {
        if (trouves.length === 1) {
          ligneNavette = trouves[0]
          methodeNavette = methode
          break
        }
        // Plusieurs candidates sur ce critère. On ne descend pas au critère
        // suivant, moins fiable, pour trancher — mais si une seule de ces
        // candidates est désignée par **tous** les critères renseignés, ce
        // n'est plus un choix au jugé : deux critères concordent.
        const croisement = trouves.filter((c) => nonVides.every(([, autres]) => autres.some((a) => a.id === c.id)))
        if (croisement.length === 1) {
          ligneNavette = croisement[0]
          methodeNavette = methode
          break
        }
        navetteAmbigue = trouves
        break
      }
    }

    // Ce qui reste sans rapprochement exact n'est pas une ligne sans origine —
    // une ligne de feuille de route vient forcément de la navette : on propose
    // les intitulés les plus proches, à trancher à la main.
    const suggestions: SuggestionNavette[] = ligneNavette
      ? []
      : navetteAmbigue.length > 0
        ? navetteAmbigue.map((ligne) => ({ ligne, score: 1 }))
        : suggestionsNavette(fdr, tokensNavette)

    // --- Fiche projet ------------------------------------------------------
    let projetId: string | null = null
    let methodeProjet: MethodeRapprochement | null = null
    if (fdr.projetId) {
      projetId = fdr.projetId
      methodeProjet = 'deja-lie'
    } else if (ligneNavette?.projetId && projetsExistants.has(ligneNavette.projetId)) {
      projetId = ligneNavette.projetId
      methodeProjet = 'navette'
    } else {
      const cascade = resoudreProjet?.(fdr) ?? null
      if (cascade && projetsExistants.has(cascade)) {
        projetId = cascade
        methodeProjet = 'cascade'
      }
    }

    // --- Ce qui serait écrit -----------------------------------------------
    const patchFdr: RapprochementLigneFdr['patchFdr'] = {}
    if (!fdr.ligneNavetteId && ligneNavette) patchFdr.ligneNavetteId = ligneNavette.id
    if (!fdr.projetId && projetId) patchFdr.projetId = projetId

    // La ligne navette reçoit la fiche projet quand elle n'en a pas : sans ce
    // retour, la navette continuerait d'afficher « non liée » une affaire dont
    // la feuille de route connaît la fiche, et `useResolveur` n'hériterait pas
    // de son code OTP.
    const patchNavette =
      ligneNavette && !ligneNavette.projetId && projetId ? { ligneId: ligneNavette.id, projetId } : null

    return {
      fdr,
      ligneNavette,
      methodeNavette,
      navetteAmbigue,
      suggestions,
      projetId,
      methodeProjet,
      patchFdr,
      patchNavette,
    }
  })

  // --- Fiches projet sans ligne de feuille de route -------------------------
  const projetsCouverts = new Set(lignes.map((l) => l.projetId).filter((id): id is string => !!id))
  const projetsSansLigne: ProjetSansLigneFdr[] = projets
    .filter((p) => !projetsCouverts.has(p.id))
    .map((projet) => {
      const candidates = parProjet.get(projet.id) ?? []
      return { projet, ligneNavette: candidates.length === 1 ? candidates[0] : null }
    })

  return {
    lignes,
    projetsSansLigne,
    resume: {
      totalFdr: lignes.length,
      dejaLieesNavette: lignes.filter((l) => l.methodeNavette === 'deja-lie').length,
      aLierNavette: lignes.filter((l) => l.patchFdr.ligneNavetteId).length,
      ambigues: lignes.filter((l) => l.navetteAmbigue.length > 0).length,
      // Une ligne dont le lien est déjà posé n'est pas « sans
      // correspondance », même si la ligne navette qu'elle désigne a disparu
      // depuis : elle est comptée comme déjà liée, et son lien est laissé tel
      // quel.
      sansCorrespondance: lignes.filter(
        (l) => l.methodeNavette === null && l.navetteAmbigue.length === 0
      ).length,
      dejaLieesProjet: lignes.filter((l) => l.methodeProjet === 'deja-lie').length,
      aLierProjet: lignes.filter((l) => l.patchFdr.projetId).length,
      lignesNavetteAPourvoir: new Set(lignes.filter((l) => l.patchNavette).map((l) => l.patchNavette!.ligneId)).size,
      projetsSansLigne: projetsSansLigne.length,
      avecSuggestion: lignes.filter((l) => !l.ligneNavette && l.suggestions.length > 0).length,
      sansOrigine: lignes.filter((l) => !l.ligneNavette && l.suggestions.length === 0).length,
    },
  }
}

// ---------------------------------------------------------------------------
// Construction d'une ligne de feuille de route

// Mappage ServiceClient (fiche projet) → SERVICE_LEADERS_FEUILLE_DE_ROUTE.
// Pas de correspondance fiable pour EXP/Autre : laissé à null plutôt que
// rangé dans un service au jugé.
const SERVICE_LEADER_PAR_SERVICE_CLIENT: Partial<
  Record<ServiceClient, (typeof SERVICE_LEADERS_FEUILLE_DE_ROUTE)[number]>
> = {
  Construction: 'CONSTRUCTION',
  Métal: 'METAL',
  Projet: 'PROJET',
}

/**
 * Les champs d'une ligne de feuille de route dérivables d'une ligne navette et
 * d'une fiche projet.
 *
 * Partagé avec `FeuilleDeRouteContext.synchroniserDepuisNavette`, qui en
 * portait sa propre copie : deux mappages du même objet auraient fini par
 * diverger, et c'est précisément ce que le rapprochement doit pouvoir
 * reproduire à l'identique.
 *
 * Les colonnes sans équivalent (catégorie, priorité, statut, flag…) n'y sont
 * pas : elles ne sont jamais écrasées par une synchronisation.
 */
export function champsFdrDepuisNavette(ligne: LigneNavette, projet: Projet) {
  return {
    projetId: projet.id,
    ligneNavetteId: ligne.id,
    projet: projet.nom,
    champs: ligne.champ ?? projet.champ ?? null,
    otp: ligne.codeOTP,
    compteImputation: ligne.codeOTP,
    serviceLeader: SERVICE_LEADER_PAR_SERVICE_CLIENT[projet.serviceClient] ?? null,
    dateDebut: projet.dateDebut || null,
    dateFin: projet.dateFin || null,
    pdc02_2026_kusd: totalBudget(ligne.cycles.PDC02),
    bu26ServKusd: ligne.cycles.BU.serv,
  }
}

/**
 * Ligne de feuille de route représentant une fiche projet.
 *
 * Sans ligne navette, seules les colonnes que la fiche porte réellement sont
 * remplies : ni BU ni PDC ne sont inventés, `calculerLigne` les affichera vides
 * jusqu'à ce qu'une ligne navette soit rattachée.
 */
export function ligneFdrDepuisProjet(
  projet: Projet,
  ligneNavette: LigneNavette | null,
  id: number
): ProjetFeuilleDeRoute {
  if (ligneNavette) return { ...EMPTY_PROJET_FEUILLE_DE_ROUTE, ...champsFdrDepuisNavette(ligneNavette, projet), id }
  return {
    ...EMPTY_PROJET_FEUILLE_DE_ROUTE,
    id,
    projetId: projet.id,
    projet: projet.nom,
    champs: projet.champ ?? null,
    otp: projet.codeOTP ?? null,
    compteImputation: projet.codeOTP ?? null,
    serviceLeader: SERVICE_LEADER_PAR_SERVICE_CLIENT[projet.serviceClient] ?? null,
    dateDebut: projet.dateDebut || null,
    dateFin: projet.dateFin || null,
    wp: projet.workProgram ? 'OUI' : 'NON',
  }
}

/**
 * Identifiants de n nouvelles lignes, tous distincts.
 *
 * L'identifiant d'une ligne créée depuis l'application est l'horodatage (et
 * non `max(id) + 1`, qui produisait des collisions — cf. `prochainIdFdr`).
 * Mais créer plusieurs lignes dans le même lot les produirait toutes dans la
 * même milliseconde : on décale d'autant, ce qui reste sans collision possible
 * avec les petits entiers des 84 lignes importées.
 */
export function prochainsIdsFdr(nombre: number, maintenant = Date.now()): number[] {
  return Array.from({ length: nombre }, (_, i) => maintenant + i)
}

// ---------------------------------------------------------------------------
// Écriture

export interface ResultatRapprochement {
  /** Lignes de feuille de route mises à jour (lien navette et/ou fiche). */
  lignesFdrLiees: number
  /** Lignes navette qui ont reçu leur fiche projet. */
  lignesNavetteLiees: number
  /** Lignes de feuille de route créées pour une fiche qui n'en avait pas. */
  lignesFdrCreees: number
  /** Lignes créées, pour mise à jour de l'état local sans relecture. */
  creees: ProjetFeuilleDeRoute[]
}

/**
 * Applique le rapprochement — les seules écritures du module.
 *
 * `creerLignesManquantes` est optionnel et séparé du reste : rattacher des
 * lignes existantes ne crée rien, alors qu'ajouter une ligne par fiche projet
 * fait grossir la feuille de route. Les deux gestes n'ont pas la même portée,
 * ils ne se déclenchent donc pas ensemble sans le dire.
 *
 * `lignes_navette` est en `allow update: if estAdmin()` : sans droits admin, la
 * partie navette échoue — d'où l'appel réservé aux admins côté écran.
 */
export async function appliquerRapprochement(
  rapprochement: RapprochementPortefeuille,
  { creerLignesManquantes = false }: { creerLignesManquantes?: boolean } = {}
): Promise<ResultatRapprochement> {
  const aMettreAJour = rapprochement.lignes.filter((l) => Object.keys(l.patchFdr).length > 0)
  const navetteAPourvoir = [...new Map(
    rapprochement.lignes
      .filter((l) => l.patchNavette)
      .map((l) => [l.patchNavette!.ligneId, l.patchNavette!])
  ).values()]
  const aCreer = creerLignesManquantes ? rapprochement.projetsSansLigne : []
  const ids = prochainsIdsFdr(aCreer.length)
  const creees = aCreer.map(({ projet, ligneNavette }, i) => ligneFdrDepuisProjet(projet, ligneNavette, ids[i]))

  for (const lot of enLots(aMettreAJour)) {
    const batch = writeBatch(db)
    for (const ligne of lot) {
      batch.update(doc(db, COLLECTIONS.feuilleDeRoute, String(ligne.fdr.id)), ligne.patchFdr)
    }
    await batch.commit()
  }

  for (const lot of enLots(navetteAPourvoir)) {
    const batch = writeBatch(db)
    for (const patch of lot) {
      batch.update(doc(db, COLLECTIONS.lignesNavette, patch.ligneId), { projetId: patch.projetId })
    }
    await batch.commit()
  }

  for (const lot of enLots(creees)) {
    const batch = writeBatch(db)
    for (const ligne of lot) {
      batch.set(doc(db, COLLECTIONS.feuilleDeRoute, String(ligne.id)), ligne)
    }
    await batch.commit()
  }

  return {
    lignesFdrLiees: aMettreAJour.length,
    lignesNavetteLiees: navetteAPourvoir.length,
    lignesFdrCreees: creees.length,
    creees,
  }
}

/** Relit la feuille de route après écriture (l'état local est en mémoire). */
export async function relireFeuilleDeRoute(): Promise<ProjetFeuilleDeRoute[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.feuilleDeRoute))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as ProjetFeuilleDeRoute)
}

/**
 * Rattache une ligne de feuille de route à une ligne navette choisie à la main.
 *
 * C'est la sortie des cas que le rapprochement automatique refuse de trancher
 * (ambiguïté, intitulé trop éloigné) — et la règle métier veut qu'ils finissent
 * tous rattachés : une ligne de feuille de route vient de la navette.
 *
 * La fiche projet suit dans le même geste quand l'une des deux la connaît et
 * que l'autre non : c'est le seul moment où les deux sont sous les yeux.
 * Écriture ciblée (pas de `writeBatch`) — un seul document de chaque côté.
 */
export async function rattacherLigneFdr(
  fdr: ProjetFeuilleDeRoute,
  ligne: LigneNavette
): Promise<{ ligneNavetteId: string; projetId?: string }> {
  const projetId = fdr.projetId ?? ligne.projetId
  const patch: { ligneNavetteId: string; projetId?: string } = { ligneNavetteId: ligne.id }
  if (!fdr.projetId && projetId) patch.projetId = projetId

  await updateDoc(doc(db, COLLECTIONS.feuilleDeRoute, String(fdr.id)), patch)
  // La ligne navette n'est pourvue que si elle ne l'était pas : un lien déjà
  // posé n'est jamais réécrit, ici comme dans le rapprochement en lot.
  if (!ligne.projetId && projetId) {
    await updateDoc(doc(db, COLLECTIONS.lignesNavette, ligne.id), { projetId })
  }
  return patch
}
