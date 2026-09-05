import type { LigneJournalPeinture, ParametresContratPeinture } from '../types/contratPeinture'

// Modèle de productivité du contrat peinture (27/08/2026, `doc/Contrat
// peinture.docx`, partie « La feuille DATA » — lot 2 de
// `doc/recueil-module-contrat-peinture.md`).
//
// La chaîne du document, dans son ordre :
//
//   1. capacité productive = Σ (effectif × coefficient du profil)
//      « 1 Chef d'équipe = 0,5 · 2 Peintres = 2 · Capacité totale = 2,5 »
//   2. rendement par unité productive = objectif journalier / capacité de
//      **l'équipe de référence** — « 10 / 2,5 = 4 m² par jour »
//   3. objectif d'un profil = rendement × coefficient
//      « chef d'équipe : 4 × 0,5 = 2 · peintre : 4 × 1 = 4 »
//   4. objectif d'une journée = Σ (effectif réel × objectif du profil)
//      « lorsque l'utilisateur renseigne le nombre de chefs d'équipe et de
//      peintres, l'application doit recalculer automatiquement l'objectif
//      journalier correspondant »
//
// **L'équipe de référence est bien dans le calcul**, et c'est le point qu'il
// faut avoir en tête avant de toucher à ce fichier : c'est elle qui fournit
// le dénominateur de l'étape 2. Sans elle, le rendement de 4 m² par unité ne
// se déduit de rien. (Le lot 1 avait écrit l'inverse — corrigé ici.) Elle est
// ce qui fait que la chaîne « tourne en rond » correctement : appliquée à
// l'équipe de référence elle-même, l'étape 4 redonne exactement l'objectif
// contractuel — 2,5 × 4 = 10 m²/jour.
//
// **Vérifié avant d'être écrit**, contre le classeur et non contre une
// intuition : la chaîne rejoue les 6 valeurs figées du bloc « objectifs » de
// la feuille DATA sur les 3 champs (`chefEquipeObjectif` 2,
// `peintreObjectif` 4, `chefEquipePct` 0,2, `peintrePct` 0,4) **sans aucun
// écart**, et retrouve `cibleJour` et `productiviteParProfil` sur les **640
// lignes de pointage PERSONNEL** du JOURNAL — 0 écart. Réserve honnête : le
// classeur n'exerce qu'une seule configuration d'effectif (l'équipe de
// référence elle-même), la formule est donc reprise du document, pas induite
// des données.
//
// Règle de fond, appliquée partout ici : **une entrée manquante rend `null`,
// jamais 0**. Un profil sans coefficient déclaré ne pèse rien dans l'objectif
// et est nommé à l'appelant, pour que l'écran puisse le dire au lieu
// d'afficher un objectif silencieusement trop bas.

const nombre = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Comparaison des libellés : le classeur mélange les casses et les espaces. */
const cle = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

export interface EffectifProfil {
  profil: string
  effectif: number
}

/** Un profil, tel que le modèle le voit une fois les paramètres appliqués. */
export interface ProfilCalcule {
  profil: string
  coefficient: number | null
  /** Production attendue d'une personne de ce profil, en m²/jour. */
  objectifJour: number | null
  /** Part de l'objectif contractuel qu'une personne de ce profil représente. */
  part: number | null
}

/** Le modèle de productivité d'un champ, entièrement dérivé des paramètres. */
export interface ModeleProductivite {
  site: string
  objectifJourM2: number | null
  nombreHeures: number | null
  /** Capacité productive de l'équipe de référence — le 2,5 du document. */
  capaciteReference: number | null
  /** Production attendue par unité productive — le 4 m²/jour du document. */
  rendementParUnite: number | null
  profils: ProfilCalcule[]
  /** Profils de l'équipe de référence qui n'ont aucun coefficient déclaré. */
  profilsSansCoefficient: string[]
}

export function coefficientDuProfil(
  parametres: ParametresContratPeinture,
  profil: string | null | undefined
): number | null {
  const p = parametres.profils.find((x) => cle(x.profil) === cle(profil))
  return p ? nombre(p.coefficient) : null
}

/**
 * Capacité productive d'un effectif : Σ (effectif × coefficient).
 *
 * Rend aussi les profils qu'elle n'a pas su valoriser — un profil rencontré
 * sur le terrain mais jamais déclaré dans les paramètres. Il ne compte pour
 * rien, et l'écran doit pouvoir le nommer plutôt que de laisser croire à un
 * objectif complet.
 */
export function capaciteProductive(
  effectifs: EffectifProfil[],
  parametres: ParametresContratPeinture
): { capacite: number; profilsSansCoefficient: string[] } {
  let capacite = 0
  const sans: string[] = []
  for (const e of effectifs) {
    const c = coefficientDuProfil(parametres, e.profil)
    if (c === null) {
      if (!sans.some((s) => cle(s) === cle(e.profil))) sans.push(e.profil)
      continue
    }
    capacite += e.effectif * c
  }
  return { capacite, profilsSansCoefficient: sans }
}

/**
 * Production attendue par unité productive : objectif journalier du champ
 * divisé par la capacité de l'équipe de référence.
 *
 * Une capacité nulle ne donne pas un rendement infini, elle donne `null` :
 * sans équipe de référence, le contrat ne dit pas ce que vaut une unité.
 */
export function rendementParUnite(
  objectifJourM2: number | null,
  capaciteReference: number | null
): number | null {
  if (objectifJourM2 === null || capaciteReference === null || capaciteReference <= 0) return null
  return objectifJourM2 / capaciteReference
}

/** Production attendue d'une personne d'un profil : rendement × coefficient. */
export function objectifDuProfil(rendement: number | null, coefficient: number | null): number | null {
  if (rendement === null || coefficient === null) return null
  return rendement * coefficient
}

/** L'équipe de référence, exprimée comme un effectif par profil. */
export function effectifsDeReference(parametres: ParametresContratPeinture): EffectifProfil[] {
  const { chefsEquipe, peintres } = parametres.equipeReference
  // Les deux profils du contrat sont nommés par les paramètres eux-mêmes :
  // on ne code pas « Peintre » et « Chef d'Equipe » en dur, on retrouve dans
  // la liste des profils celui dont le coefficient est le plus élevé (le
  // peintre, « deux fois plus productif ») et l'autre.
  const avecCoef = parametres.profils.filter((p) => nombre(p.coefficient) !== null)
  const trie = [...avecCoef].sort((a, b) => (b.coefficient ?? 0) - (a.coefficient ?? 0))
  const profilPeintre = trie[0]?.profil
  const profilChef = trie.length > 1 ? trie[trie.length - 1].profil : undefined
  const effectifs: EffectifProfil[] = []
  if (profilPeintre && nombre(peintres) !== null) effectifs.push({ profil: profilPeintre, effectif: peintres as number })
  if (profilChef && nombre(chefsEquipe) !== null)
    effectifs.push({ profil: profilChef, effectif: chefsEquipe as number })
  return effectifs
}

/**
 * Le modèle d'un champ. `null` si le champ n'est pas déclaré dans les
 * paramètres — on ne retombe pas sur un autre champ, même quand tous portent
 * les mêmes valeurs : ce serait vrai aujourd'hui et faux au premier champ qui
 * diverge.
 */
export function modeleDuSite(
  parametres: ParametresContratPeinture,
  site: string | null | undefined
): ModeleProductivite | null {
  const s = parametres.sites.find((x) => cle(x.site) === cle(site))
  if (!s) return null
  const reference = capaciteProductive(effectifsDeReference(parametres), parametres)
  const capaciteReference = reference.capacite > 0 ? reference.capacite : null
  const objectif = nombre(s.objectifJourM2)
  const rendement = rendementParUnite(objectif, capaciteReference)
  return {
    site: s.site,
    objectifJourM2: objectif,
    nombreHeures: nombre(s.nombreHeures),
    capaciteReference,
    rendementParUnite: rendement,
    profils: parametres.profils.map((p) => {
      const coefficient = nombre(p.coefficient)
      const objectifJour = objectifDuProfil(rendement, coefficient)
      return {
        profil: p.profil,
        coefficient,
        objectifJour,
        part: objectifJour !== null && objectif ? objectifJour / objectif : null,
      }
    }),
    profilsSansCoefficient: reference.profilsSansCoefficient,
  }
}

export interface ObjectifJournalier {
  /** Objectif de production de la journée, en m². `null` si non calculable. */
  objectif: number | null
  /** Capacité productive de l'effectif mobilisé ce jour-là. */
  capacite: number | null
  profilsSansCoefficient: string[]
}

/**
 * L'objectif d'une journée à partir de l'effectif réellement mobilisé — le
 * cœur de la demande (« recalculer automatiquement l'objectif journalier
 * correspondant en appliquant les coefficients définis dans les paramètres »).
 *
 * Appliqué à l'équipe de référence, il redonne l'objectif contractuel.
 */
export function objectifJournalier(
  effectifs: EffectifProfil[],
  modele: ModeleProductivite | null
): ObjectifJournalier {
  if (!modele) return { objectif: null, capacite: null, profilsSansCoefficient: [] }
  let capacite = 0
  const sans: string[] = []
  for (const e of effectifs) {
    const p = modele.profils.find((x) => cle(x.profil) === cle(e.profil))
    const c = p ? p.coefficient : null
    if (c === null) {
      if (!sans.some((s) => cle(s) === cle(e.profil))) sans.push(e.profil)
      continue
    }
    capacite += e.effectif * c
  }
  return {
    objectif: modele.rendementParUnite === null ? null : capacite * modele.rendementParUnite,
    capacite,
    profilsSansCoefficient: sans,
  }
}

/**
 * Les deux colonnes du JOURNAL que le modèle produit, pour une ligne de
 * pointage de personnel :
 *
 * - `cibleJour` = effectif pointé × objectif du profil (2 peintres → 8 m²) ;
 * - `productiviteParProfil` = la **part** de l'objectif contractuel qu'une
 *   personne de ce profil représente (0,4 pour un peintre, 0,2 pour un chef).
 *   Elle ne dépend pas de l'effectif — vérifié sur les 640 lignes réelles,
 *   qui portent la même valeur quelle que soit la quantité pointée.
 *
 * Les deux étaient **saisies à la main** jusqu'ici (étape « Coûts » du
 * formulaire), avec ce commentaire : « restent saisis parce qu'aucune formule
 * ne les reproduit dans les données réelles ». Le document donne la formule.
 *
 * **Une valeur déjà en place n'est jamais écrasée par du vide** : une ligne
 * dont le type d'item n'est pas un profil déclaré, ou dont le champ n'est pas
 * paramétré, garde ce qu'elle portait. C'est la règle appliquée par
 * `deriveLigneJournal` aux colonnes du classeur, pour la même raison : la
 * moitié des lignes réelles ne sont pas des pointages de personnel.
 */
export function productiviteDeLaLigne<T extends Pick<LigneJournalPeinture, 'typeItem' | 'site' | 'qte' | 'cibleJour' | 'productiviteParProfil'>>(
  ligne: T,
  parametres: ParametresContratPeinture | null
): Pick<LigneJournalPeinture, 'cibleJour' | 'productiviteParProfil'> {
  const actuel = { cibleJour: ligne.cibleJour, productiviteParProfil: ligne.productiviteParProfil }
  if (!parametres) return actuel
  const modele = modeleDuSite(parametres, ligne.site)
  const profil = modele?.profils.find((p) => cle(p.profil) === cle(ligne.typeItem))
  if (!profil || profil.objectifJour === null) return actuel
  const effectif = nombre(ligne.qte)
  return {
    cibleJour: effectif === null ? actuel.cibleJour : effectif * profil.objectifJour,
    productiviteParProfil: profil.part ?? actuel.productiviteParProfil,
  }
}

/**
 * Effectif mobilisé un jour donné sur un champ : les lignes de pointage de
 * catégorie PERSONNEL, regroupées par profil.
 *
 * La catégorie est comparée en majuscules — le classeur écrit `PERSONNEL`
 * (427 lignes) et `Personnel` (227) pour la même chose.
 */
export function effectifsDuJour(
  journal: LigneJournalPeinture[],
  date: string,
  site: string
): EffectifProfil[] {
  const acc = new Map<string, EffectifProfil>()
  for (const l of journal) {
    if (l.date !== date) continue
    if (cle(l.site) !== cle(site)) continue
    if ((l.categorie ?? '').trim().toUpperCase() !== 'PERSONNEL') continue
    const profil = (l.typeItem ?? '').trim()
    if (!profil) continue
    const e = acc.get(cle(profil)) ?? { profil, effectif: 0 }
    e.effectif += nombre(l.qte) ?? 0
    acc.set(cle(profil), e)
  }
  return [...acc.values()].sort((a, b) => a.profil.localeCompare(b.profil, 'fr'))
}
