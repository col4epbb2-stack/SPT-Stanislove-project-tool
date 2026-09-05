import { collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestoreCollections'
import { DEVISES_PAR_DEFAUT, normaliserCode, tauxParDefaut, type Devise } from '../types/devise'
import { STATUT_LIGNE_DEFAUT } from '../types/navette'

// Migrations de données, déclenchées à la main par un administrateur depuis
// Paramètres › Maintenance (18/08/2026).
//
// Il n'y a pas de serveur ni de script d'administration dans ce projet : le
// front parle directement à Firestore (cf. CLAUDE.md, API abandonnée le
// 22/07/2026), et `lignes_navette` est en `allow update: if estAdmin()`. Une
// migration tourne donc dans la session d'un admin connecté, avec les mêmes
// règles que le reste de l'application — pas de chemin privilégié caché.
//
// Deux principes tenus par toutes les fonctions ci-dessous :
//   - **idempotence** : un document qui porte déjà une valeur n'est jamais
//     réécrit, relancer la migration ne change rien ;
//   - **analyse d'abord** : on peut compter ce qui serait modifié sans rien
//     écrire, parce que c'est une base de production partagée.

/** Firestore plafonne un writeBatch à 500 opérations. */
export const TAILLE_LOT = 400

/**
 * Ce qui reste à migrer : les documents dont le champ n'est pas renseigné.
 * Isolée du chargement Firestore pour être vérifiable — c'est la règle qui
 * garantit l'idempotence, une valeur déjà posée (y compris `0`) n'est jamais
 * réécrite.
 */
export function sansValeur<T>(documents: T[], lire: (d: T) => unknown): T[] {
  return documents.filter((d) => lire(d) == null)
}

/** Découpe en lots respectant le plafond de `writeBatch`. */
export function enLots<T>(elements: T[], taille = TAILLE_LOT): T[][] {
  const lots: T[][] = []
  for (let debut = 0; debut < elements.length; debut += taille) {
    lots.push(elements.slice(debut, debut + taille))
  }
  return lots
}

export interface AnalyseMigration {
  /** Documents lus dans la collection. */
  total: number
  /** Documents qui seraient modifiés. */
  aMigrer: number
  /** Documents déjà pourvus, laissés tels quels. */
  dejaPourvus: number
}

export interface ResultatMigration extends AnalyseMigration {
  /** Documents effectivement écrits. */
  migres: number
}

/**
 * Année de budget des lignes navette.
 *
 * `anneeBudget` est saisi à la création depuis le 18/08/2026 ; les lignes
 * antérieures — les 84 reprises du classeur — n'en portent aucune. Cette
 * migration leur pose la valeur choisie par l'admin (2026 par défaut :
 * l'exercice que décrivent les cycles du classeur importé).
 *
 * `simulation: true` compte sans écrire.
 */
export async function migrerAnneeBudgetNavette(
  annee: number,
  { simulation = false }: { simulation?: boolean } = {}
): Promise<ResultatMigration> {
  const snap = await getDocs(collection(db, COLLECTIONS.lignesNavette))
  // Une ligne qui porte déjà une année n'est pas touchée : la migration ne
  // doit pas écraser une saisie, même en la relançant deux fois.
  const aMigrer = sansValeur(snap.docs, (d) => (d.data() as { anneeBudget?: number }).anneeBudget)

  const analyse: AnalyseMigration = {
    total: snap.size,
    aMigrer: aMigrer.length,
    dejaPourvus: snap.size - aMigrer.length,
  }

  if (simulation || aMigrer.length === 0) return { ...analyse, migres: 0 }

  let migres = 0
  for (const lot of enLots(aMigrer)) {
    const batch = writeBatch(db)
    for (const document of lot) {
      batch.update(doc(db, COLLECTIONS.lignesNavette, document.id), { anneeBudget: annee })
    }
    await batch.commit()
    migres += lot.length
  }

  return { ...analyse, migres }
}

/**
 * Statut de vie des lignes navette (20/08/2026, demande explicite « toutes
 * les items seront considérés comme étant en cours, on rajoute la nouvelle
 * propriété directement dans la collection »).
 *
 * L'application n'en dépend pas pour fonctionner : une ligne sans statut est
 * déjà lue comme « en cours » (`statutLigne`, types/navette.ts). Cette
 * migration écrit ce que le repli dit déjà — le champ existe alors vraiment
 * en base, ce qui le rend visible pour tout ce qui lit la collection sans
 * passer par l'application (export, console Firebase, futur traitement).
 *
 * Idempotente comme sa voisine : une ligne qui porte déjà un statut n'est
 * jamais réécrite, y compris si elle est clôturée — relancer ne rouvre rien.
 */
export async function migrerStatutLignesNavette(
  { simulation = false }: { simulation?: boolean } = {}
): Promise<ResultatMigration> {
  const snap = await getDocs(collection(db, COLLECTIONS.lignesNavette))
  const aMigrer = sansValeur(snap.docs, (d) => (d.data() as { statut?: string }).statut)

  const analyse: AnalyseMigration = {
    total: snap.size,
    aMigrer: aMigrer.length,
    dejaPourvus: snap.size - aMigrer.length,
  }

  if (simulation || aMigrer.length === 0) return { ...analyse, migres: 0 }

  let migres = 0
  for (const lot of enLots(aMigrer)) {
    const batch = writeBatch(db)
    for (const document of lot) {
      batch.update(doc(db, COLLECTIONS.lignesNavette, document.id), { statut: STATUT_LIGNE_DEFAUT })
    }
    await batch.commit()
    migres += lot.length
  }

  return { ...analyse, migres }
}

// ---------------------------------------------------------------------------
// Taux de conversion du référentiel des devises (19/08/2026)
// ---------------------------------------------------------------------------
//
// Les taux fournis (1 EUR = 1,20 USD, 1 USD = 546,6308 XAF) sont posés dans
// DEVISES_PAR_DEFAUT — donc appliqués tant que la collection `devises` est
// vide. Un référentiel déjà enregistré, lui, garde ses propres valeurs : cette
// migration porte les taux dans la collection.
//
// Elle diffère de celle ci-dessus sur un point, et c'est le point sensible :
// elle **remplace** une valeur existante au lieu de ne combler que les trous.
// C'est la demande — mettre à jour les taux —, mais ça veut dire qu'elle n'est
// pas anodine : d'où l'analyse qui affiche, taux par taux, l'ancienne et la
// nouvelle valeur avant toute écriture.

/** Deux taux sont considérés identiques en deçà de cet écart (bruit flottant). */
const TOLERANCE_TAUX = 1e-12

export interface EcartTaux {
  code: string
  /** Taux actuellement en base — `null` s'il n'est pas renseigné. */
  actuel: number | null
  /** Taux qui serait écrit. */
  attendu: number
  /** Le document existe-t-il déjà dans la collection ? */
  existe: boolean
}

/**
 * Les taux de référence exprimés dans le pivot **de la collection**.
 *
 * Un taux ne veut rien dire sans sa référence : si un admin a désigné l'euro
 * comme pivot, y écrire 1,2 pour l'euro et 0,00183 pour le franc CFA (des
 * valeurs en dollars) inventerait un référentiel faux sans qu'aucun écran ne
 * puisse le signaler. On reconvertit donc dans le pivot en place — et on rend
 * `null` quand ce pivot n'a pas de taux connu, cas où il n'y a rien à écrire
 * plutôt qu'une valeur à deviner.
 */
export function tauxAttendus(codePivot: string): Record<string, number> | null {
  const defauts = tauxParDefaut()
  const facteur = defauts[normaliserCode(codePivot)]
  if (!facteur) return null
  return Object.fromEntries(Object.entries(defauts).map(([code, taux]) => [code, taux / facteur]))
}

/**
 * Ce que la migration changerait. Pure — c'est elle qui décide de ce qui est
 * écrit, elle doit être vérifiable sans Firestore.
 */
export function ecartsTaux(
  existants: { code: string; taux: number | null }[],
  attendus: Record<string, number>
): EcartTaux[] {
  const parCode = new Map(existants.map((d) => [normaliserCode(d.code), d]))
  const ecarts: EcartTaux[] = []
  for (const [code, attendu] of Object.entries(attendus)) {
    const existant = parCode.get(code)
    const actuel = existant?.taux ?? null
    // Un taux déjà juste n'est pas réécrit : la migration reste relançable
    // sans effet, et l'horodatage de mise à jour ne bouge pas pour rien.
    if (existant && actuel !== null && Math.abs(actuel - attendu) <= TOLERANCE_TAUX) continue
    ecarts.push({ code, actuel, attendu, existe: existant !== undefined })
  }
  return ecarts
}

export interface ResultatTauxDevises {
  /** Devises présentes dans la collection (0 = référentiel jamais enregistré). */
  total: number
  /** Code de la devise pivot en place. */
  pivot: string
  /** Ce qui serait écrit, ou l'a été. */
  ecarts: EcartTaux[]
  /** Documents effectivement écrits. */
  migres: number
  /** Renseigné quand rien ne peut être écrit — pivot sans taux de référence. */
  blocage?: string
}

/**
 * Écrit les taux de référence dans la collection `devises`.
 *
 * Un document existant ne reçoit que son taux (et la traçabilité de la mise à
 * jour) : libellé, symbole, décimales, état actif et surtout **le pivot** sont
 * laissés tels quels — ce sont des choix d'administration, pas des valeurs
 * livrées. Une devise absente est créée en entier depuis DEVISES_PAR_DEFAUT,
 * ce qui couvre le cas du référentiel jamais enregistré.
 */
export async function migrerTauxDevises(
  auteur: string,
  { simulation = false }: { simulation?: boolean } = {}
): Promise<ResultatTauxDevises> {
  const snap = await getDocs(collection(db, COLLECTIONS.devises))
  const existants = snap.docs.map((d) => ({
    code: normaliserCode(d.id),
    taux: (d.data() as { taux?: number | null }).taux ?? null,
    pivot: (d.data() as { pivot?: boolean }).pivot === true,
  }))

  // Collection vide : le pivot est celui du référentiel livré (USD).
  const pivot = existants.find((d) => d.pivot)?.code ?? DEVISES_PAR_DEFAUT.find((d) => d.pivot)?.code ?? 'USD'
  const attendus = tauxAttendus(pivot)
  if (!attendus) {
    return {
      total: snap.size,
      pivot,
      ecarts: [],
      migres: 0,
      blocage: `La devise pivot (${pivot}) n’a pas de taux de référence connu : les taux fournis sont exprimés en dollars et ne peuvent pas être reconvertis dans ce pivot.`,
    }
  }

  const ecarts = ecartsTaux(existants, attendus)
  if (simulation || ecarts.length === 0) return { total: snap.size, pivot, ecarts, migres: 0 }

  const majs = { majLe: new Date().toISOString(), majPar: auteur }
  let migres = 0
  for (const lot of enLots(ecarts)) {
    const batch = writeBatch(db)
    for (const ecart of lot) {
      const reference = DEVISES_PAR_DEFAUT.find((d) => d.code === ecart.code)
      if (ecart.existe) {
        batch.update(doc(db, COLLECTIONS.devises, ecart.code), { taux: ecart.attendu, ...majs })
      } else {
        const { code: _c, ...donnees } = {
          ...(reference ?? ({ libelle: ecart.code, symbole: '', decimales: 2, actif: true } as Partial<Devise>)),
          code: ecart.code,
          taux: ecart.attendu,
          // Le pivot de la collection ne se déduit pas de la référence livrée :
          // une devise créée ici ne devient pivot que si c'est déjà le pivot en
          // place. Sinon deux documents porteraient `pivot: true`.
          pivot: ecart.code === pivot,
          ...majs,
        }
        void _c
        batch.set(doc(db, COLLECTIONS.devises, ecart.code), donnees)
      }
    }
    await batch.commit()
    migres += lot.length
  }

  return { total: snap.size, pivot, ecarts, migres }
}

// ---------------------------------------------------------------------------
// Commandes (PO) vers leur collection autonome (25/08/2026)
// ---------------------------------------------------------------------------
//
// `doc/module contrat.docx` §3 demande de suivre les commandes et les factures
// de certains contrats « sans forcément être rattaché à un projet classique ».
// Une commande vivait dans le document de sa fiche (`projets/{id}.commandes[]`)
// : sans fiche, elle n'avait nulle part où exister. Elles ont désormais leur
// collection ; celle-ci y déplace l'existant.
//
// Deux différences avec les migrations ci-dessus, à connaître :
//   - elle lit `projets` et écrit dans `commandes` — ce n'est pas un champ
//     ajouté sur place, c'est un déplacement ;
//   - **la fiche d'origine n'est pas modifiée dans la même passe.** Sa liste
//     `commandes[]` reste en place ; elle cesse simplement d'être lue, la
//     commande migrée gardant son identifiant (`ProjectsContext.avecCommandes`
//     écarte la copie inline). Rien n'est donc perdu si la migration est
//     interrompue, et la fiche se nettoie d'elle-même à sa prochaine
//     sauvegarde (`sauvegarderProjet` filtre les commandes de la collection).

export interface ResultatMigrationCommandes extends ResultatMigration {
  /** Commandes déplacées qui n'ont aucun contrat rattaché. */
  sansContrat: number
}

interface CommandeInline {
  id?: string
  numero?: string
  montant?: number
  fournisseur?: string
  libelle?: string
  contratId?: string
  factures?: unknown[]
}

/**
 * Décide, pour une fiche, ce qui reste à déplacer.
 *
 * L'idempotence tient à `dejaMigrees` : une commande dont l'identifiant existe
 * déjà dans la collection n'est jamais reprise. Relancer la migration ne
 * duplique donc rien, même après une interruption au milieu d'un lot.
 */
export function commandesAMigrer(
  projets: { id: string; commandes?: CommandeInline[] }[],
  dejaMigrees: Set<string>
): { projetId: string; commande: CommandeInline }[] {
  return projets.flatMap((p) =>
    (p.commandes ?? [])
      .filter((c) => c.id !== undefined && !dejaMigrees.has(c.id))
      .map((commande) => ({ projetId: p.id, commande }))
  )
}

export async function migrerCommandesVersCollection(
  { simulation = false }: { simulation?: boolean } = {}
): Promise<ResultatMigrationCommandes> {
  const [projetsSnap, commandesSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.projets)),
    getDocs(collection(db, COLLECTIONS.commandes)),
  ])

  const projets = projetsSnap.docs.map((d) => ({ id: d.id, commandes: (d.data() as { commandes?: CommandeInline[] }).commandes }))
  const dejaMigrees = new Set(commandesSnap.docs.map((d) => d.id))
  const total = projets.reduce((s, p) => s + (p.commandes ?? []).length, 0)
  const aMigrer = commandesAMigrer(projets, dejaMigrees)

  const analyse: ResultatMigrationCommandes = {
    total,
    aMigrer: aMigrer.length,
    dejaPourvus: total - aMigrer.length,
    migres: 0,
    sansContrat: aMigrer.filter(({ commande }) => !commande.contratId).length,
  }

  if (simulation || aMigrer.length === 0) return analyse

  const horodatage = new Date().toISOString()
  let migres = 0
  for (const lot of enLots(aMigrer)) {
    const batch = writeBatch(db)
    for (const { projetId, commande } of lot) {
      // Le montant enregistré devient le **montant initial** : la commande
      // n'a jamais été augmentée dans l'application, son montant actuel est
      // donc bien son montant d'origine. Les clés absentes ne sont pas
      // écrites (Firestore refuse `undefined`).
      const donnees: Record<string, unknown> = {
        projetId,
        contratId: commande.contratId ?? null,
        numero: commande.numero ?? '',
        montantInitial: commande.montant ?? 0,
        creeLe: horodatage,
        origineProjetId: projetId,
      }
      if (commande.fournisseur !== undefined) donnees.fournisseur = commande.fournisseur
      if (commande.libelle !== undefined) donnees.libelle = commande.libelle
      if (commande.factures !== undefined) donnees.factures = commande.factures
      // Doc ID = l'identifiant d'origine : c'est ce qui rend la migration
      // rejouable et ce qui permet d'écarter la copie restée dans la fiche.
      batch.set(doc(db, COLLECTIONS.commandes, commande.id as string), donnees)
    }
    await batch.commit()
    migres += lot.length
  }

  return { ...analyse, migres }
}
