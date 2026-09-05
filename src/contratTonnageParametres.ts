import type {
  ChampTonnageParametre,
  EquipeReferenceTonnage,
  ParametresContratTonnage,
  PersonnelAnnexe,
  ProfilTonnageParametre,
  SuiviEchafSheet,
  UniteObjectifTonnage,
} from '../types/tonnageEchaf'

// Paramètres métier du contrat Échafaudage — reprise depuis les blobs importés
// du classeur, et normalisation (03/09/2026, `doc/Suivi tonnage rev01.docx`
// §A2/A3/A9 et §H/J/K, lot 1 de `doc/recueil-module-tonnage-rev01.md`).
//
// Fonctions pures : elles ne lisent ni Firestore ni le DOM, l'écran leur passe
// ce qu'il a chargé.
//
// **Ce que le module portait avant** : l'objectif contractuel n'existait nulle
// part sous ce nom. Il se déduisait de `personnelAnnexe.json` — un blob
// importé, en lecture seule : `objectifKgParHeure` 83,33 × `heuresParJour` 12
// × la capacité 2,5 de l'équipe de référence = 2 500 kg/jour. Le chiffre était
// juste, il n'était ni nommé, ni lisible, ni modifiable. C'est ce que le §A9
// demande de changer.
//
// **Rien n'est encore branché sur ces valeurs** : les 4 colonnes dérivées du
// Suivi personnel continuent de passer par `derivePersonnelTonnage()` et les
// paramètres du classeur. C'est le lot 2 qui les y branche — et il est bloqué
// par Q1, Q2 et Q3 du recueil, dont deux font diverger l'application du
// classeur sur les 3 384 lignes aujourd'hui vérifiées à 0 écart. L'écran le
// dit plutôt que de le laisser croire.

/** Une valeur numérique reprise : `null` reste `null`, jamais 0. */
const nombre = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Comparaison de libellés : le classeur mélange les casses et les espaces. */
const cle = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/**
 * Objectif journalier de l'équipe de référence, tel que le document l'énonce :
 * « Le contrat prévoit un objectif de production de référence de : **2,5
 * tonnes par jour (soit 2 500 kg/jour)** » (§A2).
 *
 * Ce n'est ni une valeur inventée ni un défaut plausible — c'est le contrat,
 * écrit noir sur blanc. Il sert de point de départ à l'écran, qui dit d'où il
 * vient et le laisse modifier (§A9 : « cette valeur doit être paramétrable »).
 */
export const OBJECTIF_JOURNALIER_DOCUMENT = 2.5
export const UNITE_OBJECTIF_DOCUMENT: UniteObjectifTonnage = 'T'

/**
 * « 1 Chef d'équipe — 2 Monteurs. Soit une équipe de 3 personnes (Core
 * Crew) » (§A2).
 *
 * Corroboré par les données sans en être déduit : `personnelAnnexe`
 * (`equipeCoreCrew`) porte **9 membres — 6 monteurs et 3 chefs d'équipe**,
 * soit exactement cette composition sur les 3 champs. La composition reste
 * celle que le document énonce ; la diviser par le nombre de champs pour la
 * retrouver serait la deviner.
 */
export const EQUIPE_REFERENCE_DOCUMENT: EquipeReferenceTonnage = { chefsEquipe: 1, monteurs: 2 }

/**
 * Coefficients de productivité (§A3) : « Chef d'équipe = 0,5 — Monteur = 1 »,
 * « la contribution théorique d'un monteur est considérée comme deux fois
 * supérieure à celle d'un chef d'équipe ».
 *
 * Le rapport de 2 est vérifié dans les données : les 3 384 pointages réels
 * portent une productivité de 1,0 sur les 2 319 lignes « Monteur » et de 0,5
 * sur les 1 065 lignes « Chef d'Equipe ». Le document et le classeur
 * concordent, il n'y a rien à trancher ici.
 */
const COEFFICIENTS_DOCUMENT: { motif: string; coefficient: number }[] = [
  { motif: 'chef', coefficient: 0.5 },
  { motif: 'monteur', coefficient: 1 },
]

/**
 * Coefficient qu'un profil reçoit d'après le document, `null` s'il n'y figure
 * pas.
 *
 * Reconnaissance sur le libellé et non sur une liste fermée : le classeur
 * écrit « Chef d'Equipe » (sans accent, majuscule au E) là où le document
 * écrit « Chef d'équipe ». Un profil que le document ne nomme pas **n'a pas de
 * coefficient inventé** — c'est la règle déjà tenue par
 * `productiviteHabituelle()` (06/08/2026) : il reste à saisir.
 */
export function coefficientDuDocument(profil: string): number | null {
  const nom = cle(profil)
  return COEFFICIENTS_DOCUMENT.find((c) => nom.includes(c.motif))?.coefficient ?? null
}

/**
 * Forfait matériel : « la mise à disposition de **5 tonnes d'échafaudage par
 * champ et par jour** » (§H).
 *
 * Repris de la feuille SUIVI TONNAGE_ECHAF plutôt que du document : sa colonne
 * « Seuil » porte **5,0 sur les 3 champs et les 26 jours** du tableau de bord
 * importé. Les deux sources concordent, autant partir de celle qui est déjà
 * dans les données. Un champ que la feuille ne couvre pas, ou qui porterait
 * plusieurs seuils, rend `null` : on ne moyenne pas un forfait contractuel.
 *
 * À ne pas confondre avec `TonnageContrat.seuilMutualisationT`, qui sert à la
 * colonne « Saving mutualisation » du Journal — un autre calcul, par ligne, et
 * dont le commentaire d'origine parle d'un plancher de 10 T.
 */
export function forfaitMaterielDuChamp(sheet: SuiviEchafSheet | null, champ: string): number | null {
  const production = sheet?.production.find((p) => cle(p.champ) === cle(champ))
  if (!production) return null
  const seuils = [...new Set(production.lignes.map((l) => l.seuil).filter((s) => nombre(s) !== null))]
  return seuils.length === 1 ? seuils[0] : null
}

/**
 * Montants mensuels des deux forfaits (§H).
 *
 * Le forfait Core crew concorde exactement avec le classeur « Facturation au
 * point » (`synthese.forfaitCoreCrewMensuel` = 6 000 000). Celui du matériel
 * **ne concorde pas** : 1 400 000 ici, 1 418 250 là-bas (Q5 du recueil). La
 * valeur du document est reprise parce que c'est le document du contrat
 * Échafaudage, et l'écran affiche l'écart plutôt que de le taire.
 */
export const FORFAIT_MATERIEL_MENSUEL_XAF = 1_400_000
export const FORFAIT_CORE_CREW_MENSUEL_XAF = 6_000_000
export const FORFAIT_MATERIEL_MENSUEL_FACTURATION_AU_POINT = 1_418_250

/** « Par défaut "GMI", car cette société détient actuellement l'exclusivité » (§C). */
export const SOCIETE_EXECUTANTE_DEFAUT = 'GMI'

/**
 * Les six causes du menu déroulant (§K).
 *
 * Ce sont **mot pour mot** celles du référentiel du contrat peinture
 * (`causesStandByDepuisReferentiel`, catégorie STD) — vérifié une à une. Les
 * deux contrats parlent la même langue, ce qui est cohérent avec le §A11 :
 * « Les calculs sont les mêmes que ce qu'on a remonté dans les autres
 * fichiers. »
 *
 * Elles vivent ici et non dans `CATALOGUE_LISTES` (Paramètres › Listes de
 * valeurs), comme celles de la peinture : une cause de stand-by appartient au
 * contrat, avec son incompressible et ses forfaits. Les déclarer aux deux
 * endroits en ferait deux sources à tenir d'accord.
 */
export const CAUSES_STANDBY_DOCUMENT = [
  'STBY LOG TG',
  'STBY METEO',
  'STBY INCOMPRESSIBLE',
  'STBY EXP',
  'STBY ICP',
  'STBY GMI',
]

/**
 * Champs du contrat, repris des paramètres de productivité de la feuille
 * « Suivi personnel » : un champ par ligne, avec ses heures journalières.
 *
 * `heuresParJour` vaut 12 sur les 3 champs du classeur — la valeur que le §A2
 * énonce (« La durée journalière de travail est fixée à 12 heures par jour »).
 * L'objectif journalier, lui, ne peut pas venir de là : le blob porte un
 * objectif **horaire** (83,33 kg/h), pas un objectif de journée. C'est celui
 * du document qui est proposé.
 */
export function champsDepuisAnnexe(annexe: PersonnelAnnexe, sheet: SuiviEchafSheet | null): ChampTonnageParametre[] {
  return annexe.heuresProductivite.map((h) => ({
    champ: h.champ,
    nombreHeures: nombre(h.heuresParJour),
    objectifJour: OBJECTIF_JOURNALIER_DOCUMENT,
    forfaitMaterielTonnesJour: forfaitMaterielDuChamp(sheet, h.champ),
    heuresIncompressibles: null,
  }))
}

/**
 * Profils du contrat, repris des **libellés réels** de l'équipe Core crew du
 * classeur (« Monteur », « Chef d'Equipe ») et non de ceux du document.
 *
 * C'est ce qui évite d'introduire une orthographe concurrente : ces libellés
 * sont ceux que portent les 3 384 pointages et les menus de saisie. Le
 * coefficient, lui, vient du document.
 */
export function profilsDepuisAnnexe(annexe: PersonnelAnnexe): ProfilTonnageParametre[] {
  const profils = [...new Set(annexe.equipeCoreCrew.map((m) => m.profil.trim()).filter(Boolean))]
  return profils.map((profil) => ({ profil, coefficient: coefficientDuDocument(profil) }))
}

/**
 * Paramètres de départ quand rien n'a encore été enregistré — la reprise sans
 * migration, même patron que le référentiel des devises (18/08/2026) et que
 * les paramètres du contrat peinture (27/08/2026) : tant que la collection est
 * vide, l'écran sert ce que portent les blobs importés, et « Enregistrer »
 * écrit ce que l'admin a sous les yeux. Les blobs ne sont jamais réécrits.
 */
export function parametresDepuisClasseur(
  annexe: PersonnelAnnexe | null,
  sheet: SuiviEchafSheet | null
): ParametresContratTonnage {
  return {
    uniteObjectif: UNITE_OBJECTIF_DOCUMENT,
    equipeReference: { ...EQUIPE_REFERENCE_DOCUMENT },
    champs: annexe ? champsDepuisAnnexe(annexe, sheet) : [],
    profils: annexe ? profilsDepuisAnnexe(annexe) : [],
    forfaitMaterielMensuelXaf: FORFAIT_MATERIEL_MENSUEL_XAF,
    forfaitCoreCrewMensuelXaf: FORFAIT_CORE_CREW_MENSUEL_XAF,
    societeExecutanteParDefaut: SOCIETE_EXECUTANTE_DEFAUT,
    causesStandBy: [...CAUSES_STANDBY_DOCUMENT],
  }
}

/**
 * Complète un document lu en base : les champs ajoutés après coup manquent sur
 * les documents déjà enregistrés, et un `undefined` traversant l'écran
 * casserait la saisie. Écrit clé par clé plutôt qu'en étalant des défauts — le
 * type les déclare toutes présentes, TypeScript considérerait donc qu'un
 * spread les écrase toujours (même piège que `normaliserParametres` côté
 * peinture et `normaliserEmploye` côté EPCM).
 */
export function normaliserParametresTonnage(lu: Partial<ParametresContratTonnage>): ParametresContratTonnage {
  return {
    uniteObjectif: lu.uniteObjectif === 'KG' ? 'KG' : 'T',
    equipeReference: {
      chefsEquipe: nombre(lu.equipeReference?.chefsEquipe),
      monteurs: nombre(lu.equipeReference?.monteurs),
    },
    champs: (lu.champs ?? []).map((c) => ({
      champ: c.champ,
      nombreHeures: nombre(c.nombreHeures),
      objectifJour: nombre(c.objectifJour),
      forfaitMaterielTonnesJour: nombre(c.forfaitMaterielTonnesJour),
      heuresIncompressibles: nombre(c.heuresIncompressibles),
    })),
    profils: (lu.profils ?? []).map((p) => ({ profil: p.profil, coefficient: nombre(p.coefficient) })),
    forfaitMaterielMensuelXaf: nombre(lu.forfaitMaterielMensuelXaf),
    forfaitCoreCrewMensuelXaf: nombre(lu.forfaitCoreCrewMensuelXaf),
    societeExecutanteParDefaut: lu.societeExecutanteParDefaut ?? null,
    causesStandBy: lu.causesStandBy ?? [],
    ...(lu.misAJourLe ? { misAJourLe: lu.misAJourLe } : {}),
    ...(lu.misAJourPar ? { misAJourPar: lu.misAJourPar } : {}),
  }
}

// --- Deux lectures dérivées, affichées par l'écran ------------------------
//
// Elles ne calculent aucun objectif : ce sera le lot 2. Elles montrent
// seulement l'effet de ce qu'on règle, pour qu'un coefficient oublié ou une
// unité mal choisie se voient au moment de la saisie.

/**
 * Capacité productive de l'équipe de référence — le « 0,5 + 1 + 1 = 2,5 » du
 * §A3.
 *
 * Rend `null` dès qu'un des deux profils du document manque ou n'a pas de
 * coefficient : une capacité silencieusement trop basse ferait passer un
 * réglage incomplet pour un réglage valide.
 */
export function capaciteReference(parametres: ParametresContratTonnage): number | null {
  const { chefsEquipe, monteurs } = parametres.equipeReference
  if (chefsEquipe === null || monteurs === null) return null
  const coefficient = (motif: string) =>
    parametres.profils.find((p) => cle(p.profil).includes(motif))?.coefficient ?? null
  const coefChef = coefficient('chef')
  const coefMonteur = coefficient('monteur')
  if (coefChef === null || coefMonteur === null) return null
  return chefsEquipe * coefChef + monteurs * coefMonteur
}

/**
 * L'objectif journalier dans l'autre unité — « le suivi opérationnel doit être
 * disponible à la fois en tonnes et en kilogrammes. 1 tonne = 1000 kg » (§A5).
 */
export function objectifDansLautreUnite(
  objectifJour: number | null,
  unite: UniteObjectifTonnage
): { valeur: number; unite: UniteObjectifTonnage } | null {
  if (objectifJour === null) return null
  return unite === 'T'
    ? { valeur: objectifJour * 1000, unite: 'KG' }
    : { valeur: objectifJour / 1000, unite: 'T' }
}
