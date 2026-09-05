import type {
  LignePersonnelTonnage,
  ParametresContratTonnage,
  UniteObjectifTonnage,
} from '../types/tonnageEchaf'

// Modèle de productivité du contrat Échafaudage (03/09/2026, `doc/Suivi
// tonnage rev01.docx`, partie « DATA pour le calcul de la productivité » —
// lot 2 de `doc/recueil-module-tonnage-rev01.md`).
//
// La chaîne du document, dans son ordre :
//
//   1. capacité productive du jour = Σ (coefficient de chaque personne pointée)
//      « 1 Chef d'équipe = 0,5 et 2 Monteurs = 2. Capacité totale : 2,5 » (§A3)
//   2. objectif individuel = objectif de l'équipe × (coefficient / capacité)
//      « Chef d'équipe : 2,5 × (0,5 / 2,5) = 0,5 T/jour » (§A4)
//   3. « La somme des objectifs individuels doit **toujours** être égale à
//      l'objectif global de l'équipe » (§A4)
//   4. productivité horaire = objectif individuel / nombre d'heures
//      « Monteur : 1 / 12 = 0,0833 T/h » (§A6)
//   5. NPT = heures de présence − heures productives ; part de temps productif
//      = heures productives / heures de présence (§A7, §A8)
//
// ---------------------------------------------------------------------------
// DEUX CHOSES À SAVOIR AVANT DE TOUCHER À CE FICHIER
// ---------------------------------------------------------------------------
//
// **1. Ce moteur ne remplace pas `derivePersonnelTonnage`, il vit à côté.**
// Celui-là reproduit le classeur et est verrouillé par un test qui le rejoue
// sur les 3 384 pointages réels à 0 écart. Il reste la source des colonnes des
// **lignes importées**. Ce moteur-ci applique la règle du document et ne sert
// qu'aux **lignes saisies dans l'application** (même cohabitation que
// `coutsUnitairesDuTarif` à côté de `deriveLigneJournal` côté peinture).
//
// **2. Les deux règles divergent, et c'est un arbitrage explicite de
// l'utilisateur** (Q1 du recueil, tranchée le 03/09/2026 : « effectif
// réellement pointé »). Le classeur applique un rendement **fixe** par unité
// productive — un monteur vise 1 T quelle que soit l'équipe. Le document
// répartit un objectif **fixe** sur l'effectif du jour — 6 personnes visent le
// même total que 3. Les deux coïncident exactement sur l'équipe de référence
// (capacité 2,5), d'où l'exemple du document qui ne les départage pas.
//
// Mesuré sur les données réelles avant d'écrire : sur les **655 jours-champ**
// du classeur, 318 portent exactement l'équipe de référence et 337 un effectif
// plus large (le plus souvent un multiple exact : 2 équipes sur 151 jours,
// 3 sur 51, 4 sur 29). Soit **2 430 des 3 384 pointages sur un jour où les
// deux règles divergent** — raison de plus pour ne pas réécrire l'historique.
//
// Autre relevé du même passage, utile si la règle devait être revue : la
// **Core crew seule pèse invariablement 2,5** de capacité (445 des 446
// jours-champ où elle est pointée, une seule anomalie à 4,5) ; tout le renfort
// est en Part Variable. Regrouper par mode de facturation ferait donc
// coïncider les deux règles sur toutes les lignes Core crew. C'est une
// décision, pas une évidence — d'où `groupeObjectif()` ci-dessous, seul point
// à changer si elle est prise.

/** Une valeur numérique : `null` reste `null`, jamais 0. */
const nombre = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Comparaison de libellés : le classeur mélange les casses et les espaces. */
const cle = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/** Les colonnes dont ce moteur a besoin — pas la ligne entière. */
export type PointageProductivite = Pick<
  LignePersonnelTonnage,
  'id' | 'date' | 'champs' | 'profil' | 'nombreHeures' | 'standby'
>

/**
 * **Le point de décision du lot.** Les pointages qui partagent cet identifiant
 * se partagent l'objectif de la journée.
 *
 * Un jour, un champ : c'est la maille du contrat — l'objectif de 2,5 T et le
 * forfait matériel de 5 T sont l'un et l'autre définis « par champ et par
 * jour » (§A2, §H). Le mode de facturation n'entre pas dans la clé : le
 * document ne le mentionne nulle part dans sa partie DATA (cf. l'en-tête de ce
 * fichier si cette lecture doit être revue).
 */
export function groupeObjectif(l: Pick<PointageProductivite, 'date' | 'champs'>): string {
  return `${l.date}|${cle(l.champs)}`
}

/**
 * Coefficient d'un profil, lu dans les paramètres du contrat.
 *
 * `null` quand le profil n'y est pas déclaré : **un profil sans coefficient ne
 * pèse rien et n'en reçoit pas un d'office**. Il est nommé à l'appelant
 * (`profilsSansCoefficient`) pour que l'écran puisse le dire, au lieu
 * d'afficher un objectif silencieusement faux.
 */
export function coefficientDuProfil(
  parametres: ParametresContratTonnage,
  profil: string | null | undefined
): number | null {
  if (!profil) return null
  return nombre(parametres.profils.find((p) => cle(p.profil) === cle(profil))?.coefficient)
}

/** L'objectif d'un champ ramené en tonnes, quelle que soit l'unité réglée (§A5). */
export function objectifChampEnTonnes(
  parametres: ParametresContratTonnage,
  champ: string | null | undefined
): number | null {
  const declare = parametres.champs.find((c) => cle(c.champ) === cle(champ))
  const objectif = nombre(declare?.objectifJour)
  if (objectif === null) return null
  return enTonnes(objectif, parametres.uniteObjectif)
}

export function enTonnes(valeur: number, unite: UniteObjectifTonnage): number {
  return unite === 'T' ? valeur : valeur / 1000
}

/** Heures d'une journée : celles du pointage, à défaut celles du champ. */
function heuresDuPointage(
  parametres: ParametresContratTonnage,
  l: Pick<PointageProductivite, 'champs' | 'nombreHeures'>
): number | null {
  const saisies = nombre(l.nombreHeures)
  if (saisies !== null) return saisies
  return nombre(parametres.champs.find((c) => cle(c.champ) === cle(l.champs))?.nombreHeures)
}

/** Ce que le modèle rend pour une personne, un jour donné. */
export interface ObjectifIndividuel {
  /** Coefficient du profil (§A3), `null` s'il n'est pas déclaré. */
  coefficient: number | null
  /** Capacité productive de l'effectif pointé ce jour-là sur ce champ (§A3). */
  capaciteJour: number | null
  /** Objectif de l'équipe pour la journée, en tonnes. */
  objectifEquipeT: number | null
  /** Objectif individuel (§A4), en tonnes. */
  objectifJourT: number | null
  /** Le même en kilogrammes — « 1 tonne = 1000 kg » (§A5). */
  objectifJourKg: number | null
  /** Productivité horaire théorique (§A6), en tonnes/heure. */
  productiviteHoraireT: number | null
  /** La même en kg/h — c'est ce que le classeur range en « Objectif prod. (KG) ». */
  productiviteHoraireKg: number | null
  /** NPT en heures — « NPT = Heures de présence − Heures productives » (§A8). */
  nptHeures: number | null
  /** NPT en part du temps de présence, la forme qu'en donne le classeur. */
  npt: number | null
  /** Part de temps productif (§A7) = 1 − NPT. */
  partTempsProductif: number | null
  /** Profils du même jour-champ dont le coefficient manque, pour que l'écran le dise. */
  profilsSansCoefficient: string[]
}

const VIDE: ObjectifIndividuel = {
  coefficient: null,
  capaciteJour: null,
  objectifEquipeT: null,
  objectifJourT: null,
  objectifJourKg: null,
  productiviteHoraireT: null,
  productiviteHoraireKg: null,
  nptHeures: null,
  npt: null,
  partTempsProductif: null,
  profilsSansCoefficient: [],
}

/**
 * Le modèle appliqué à un ensemble de pointages : rend, pour chaque ligne, son
 * objectif individuel et ses indicateurs de temps.
 *
 * L'entrée est l'ensemble **complet** des pointages concernés — c'est lui qui
 * porte la capacité productive du jour. Passer une seule ligne donnerait un
 * objectif calculé sur elle seule, ce qui est faux dès qu'un binôme travaille.
 *
 * Une personne sans coefficient est **exclue du dénominateur** : la compter
 * pour 0 ne changerait rien, mais la compter pour 1 diluerait l'objectif des
 * autres à cause d'une donnée manquante.
 */
export function objectifsDuJour(
  pointages: PointageProductivite[],
  parametres: ParametresContratTonnage
): Map<PointageProductivite['id'], ObjectifIndividuel> {
  const groupes = new Map<string, PointageProductivite[]>()
  for (const l of pointages) {
    const g = groupeObjectif(l)
    groupes.set(g, [...(groupes.get(g) ?? []), l])
  }

  const resultat = new Map<PointageProductivite['id'], ObjectifIndividuel>()
  for (const lignes of groupes.values()) {
    const coefficients = new Map(lignes.map((l) => [l.id, coefficientDuProfil(parametres, l.profil)]))
    const declares = [...coefficients.values()].filter((c): c is number => c !== null)
    const capaciteJour = declares.length > 0 ? declares.reduce((s, c) => s + c, 0) : null
    const profilsSansCoefficient = [
      ...new Set(
        lignes.filter((l) => coefficients.get(l.id) === null).map((l) => l.profil ?? '—')
      ),
    ]

    for (const l of lignes) {
      const coefficient = coefficients.get(l.id) ?? null
      const objectifEquipeT = objectifChampEnTonnes(parametres, l.champs)
      const heures = heuresDuPointage(parametres, l)
      const standby = nombre(l.standby)

      const objectifJourT =
        objectifEquipeT !== null && coefficient !== null && capaciteJour !== null && capaciteJour > 0
          ? (objectifEquipeT * coefficient) / capaciteJour
          : null
      const productiviteHoraireT =
        objectifJourT !== null && heures !== null && heures > 0 ? objectifJourT / heures : null
      const npt = heures !== null && heures > 0 ? (standby ?? 0) / heures : null

      resultat.set(l.id, {
        coefficient,
        capaciteJour,
        objectifEquipeT,
        objectifJourT,
        objectifJourKg: objectifJourT === null ? null : objectifJourT * 1000,
        productiviteHoraireT,
        productiviteHoraireKg: productiviteHoraireT === null ? null : productiviteHoraireT * 1000,
        // Le NPT en heures est le stand-by lui-même : le §J intitule d'ailleurs
        // sa section « Stand-by (STD=NPT) ». Il reste `null` — et non 0 — quand
        // rien n'a été pointé : une absence de relevé n'est pas un stand-by nul.
        nptHeures: standby,
        npt,
        partTempsProductif: npt === null ? null : 1 - npt,
        profilsSansCoefficient,
      })
    }
  }
  return resultat
}

/** Le modèle pour une seule personne, l'effectif du jour étant fourni à part. */
export function objectifDeLaLigne(
  ligne: PointageProductivite,
  effectifDuJour: PointageProductivite[],
  parametres: ParametresContratTonnage
): ObjectifIndividuel {
  return objectifsDuJour(effectifDuJour, parametres).get(ligne.id) ?? VIDE
}

/**
 * Une ligne saisie dans l'application, par opposition à une ligne importée du
 * classeur.
 *
 * La convention est celle du module depuis le 06/08/2026 et elle est vérifiée :
 * les 3 384 lignes importées portent un `id` numérique, une saisie porte son
 * identifiant de document Firestore (une chaîne).
 *
 * **C'est elle qui décide de quelles lignes sont recalculées.** Les lignes du
 * classeur gardent les valeurs qu'Excel leur a données : les recalculer sous
 * une autre règle que la sienne ferait dire à l'application autre chose que sa
 * source sur 2 430 lignes d'un journal que l'on consulte encore. C'est la
 * règle déjà tenue ailleurs dans le projet (durée courue du Grand arrêt,
 * lignes importées de la peinture) : on n'écrit pas l'histoire à rebours.
 */
export function estLigneSaisie(l: Pick<LignePersonnelTonnage, 'id'>): boolean {
  return typeof l.id === 'string'
}

/**
 * Les 4 colonnes dérivées telles qu'elles doivent s'afficher pour une ligne :
 * recalculées si elle a été saisie dans l'application, reprises du classeur
 * sinon.
 *
 * `objectifJourKg` fait exception et est **toujours** calculé : c'est la simple
 * conversion en kilogrammes de l'objectif déjà affiché (§A5, 1 T = 1 000 kg),
 * donc elle ne peut pas contredire le classeur.
 */
export interface ColonnesPersonnelAffichees {
  objectifJourT: number | null
  objectifJourKg: number | null
  productiviteHoraireKg: number | null
  nptHeures: number | null
  npt: number | null
  partTempsProductif: number | null
  recalculee: boolean
}

export function colonnesAffichees(
  l: LignePersonnelTonnage,
  objectifs: Map<PointageProductivite['id'], ObjectifIndividuel>
): ColonnesPersonnelAffichees {
  const calcule = objectifs.get(l.id)
  const recalculee = estLigneSaisie(l) && calcule !== undefined
  const objectifJourT = recalculee ? (calcule?.objectifJourT ?? null) : nombre(l.objectifProductionT)
  return {
    objectifJourT,
    objectifJourKg: objectifJourT === null ? null : objectifJourT * 1000,
    productiviteHoraireKg: recalculee
      ? (calcule?.productiviteHoraireKg ?? null)
      : nombre(l.objectifProductionKg),
    nptHeures: nombre(l.standby),
    npt: recalculee ? (calcule?.npt ?? null) : nombre(l.npt),
    partTempsProductif: recalculee
      ? (calcule?.partTempsProductif ?? null)
      : nombre(l.partTempsProductif),
    recalculee,
  }
}
