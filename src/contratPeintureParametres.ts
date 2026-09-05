import type {
  ConsommablePeintureParametre,
  EquipementPeintureParametre,
  ParametresContratPeinture,
  PeintureReferentiel,
  ProfilPeintureParametre,
  SitePeintureParametre,
  TarifPeinture,
} from '../types/contratPeinture'

// Paramètres métier du contrat peinture — reprise du référentiel DATA importé
// et normalisation (27/08/2026, `doc/Contrat peinture.docx` §11, lot 1).
//
// Fonctions pures : elles ne lisent ni Firestore ni le DOM, l'écran leur passe
// ce qu'il a chargé.

/**
 * Composition de l'équipe de référence, telle que le document l'énonce :
 * « 1 Chef d'équipe, 2 Peintres. Soit : 3 personnes ».
 *
 * Ce n'est pas une valeur inventée ni un défaut plausible — c'est le contrat,
 * écrit noir sur blanc dans la partie « La feuille DATA ». Elle sert de point
 * de départ à l'écran, qui dit d'où elle vient et la laisse modifier.
 *
 * Elle **est utilisée par le calcul** : sa capacité productive est le
 * dénominateur du rendement par unité (cf. contratPeintureProductivite.ts).
 * La changer change tous les objectifs par profil.
 */
export const EQUIPE_REFERENCE_DOCUMENT = { chefsEquipe: 1, peintres: 2 } as const

/** Une valeur numérique du référentiel : `null` reste `null`, jamais 0. */
const nombre = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Sites du contrat, repris du bloc « objectifs » de la feuille DATA : un site
 * par ligne, avec ses heures journalières et son objectif.
 *
 * `heuresIncompressibles` reste **vide** : le document demande « une valeur
 * par défaut […] pour chaque site » mais **n'en donne aucune**, et le classeur
 * n'en porte pas non plus (cf. Q6 du recueil). Un 0 se lirait comme « aucun
 * stand-by incompressible », ce qui est faux — c'est la cause la plus
 * fréquente du classeur (168 lignes sur 345).
 */
export function sitesDepuisReferentiel(referentiel: PeintureReferentiel): SitePeintureParametre[] {
  return referentiel.objectifsProfil.map((o) => ({
    site: o.champ,
    nombreHeures: nombre(o.nombreHeures),
    objectifJourM2: nombre(o.objectifJourM2),
    heuresIncompressibles: null,
  }))
}

/**
 * Profils et leurs coefficients, repris de la colonne `coefficient` du bloc
 * « tarifs » de la feuille DATA — la seule ligne du référentiel qui porte le
 * rapport 2:1 du document (Peintre 1, Chef d'Equipe 0,5).
 *
 * Seules les lignes qui portent réellement un coefficient sont reprises : les
 * 18 autres types d'item du référentiel ne sont pas des profils.
 */
export function profilsDepuisReferentiel(referentiel: PeintureReferentiel): ProfilPeintureParametre[] {
  return referentiel.tarifs
    .filter((t) => nombre(t.coefficient) !== null)
    .map((t) => ({ profil: t.typeItem.trim(), coefficient: nombre(t.coefficient) }))
}

/**
 * Causes de stand-by, reprises des lignes de catégorie STD du référentiel.
 *
 * Le référentiel en porte exactement six, et ce sont **exactement celles du
 * §10** — les deux sources concordent, il n'y a donc rien à trancher ici.
 *
 * Ce que la reprise ne fait pas, volontairement : le JOURNAL réel porte
 * `STBY SITE TG` sur 128 lignes, qui n'est **dans aucune des deux listes**
 * (cf. Q4 du recueil). Il n'est ni ajouté d'office — ce serait décider à la
 * place de l'utilisateur — ni retiré des lignes qui le portent : la liste des
 * causes est additive, comme toutes les listes de valeurs de l'application.
 */
export function causesStandByDepuisReferentiel(referentiel: PeintureReferentiel): string[] {
  return [
    ...new Set(
      referentiel.tarifs
        .filter((t) => (t.categorie ?? '').trim().toUpperCase() === 'STD')
        .map((t) => t.typeItem.trim())
        .filter(Boolean)
    ),
  ]
}

/**
 * Les types d'item tarifés du référentiel, proposés à la classification.
 *
 * **Ni les consommables ni les équipements ne sont repris d'office**, et
 * c'est un choix : la feuille DATA classe `Grit`, `M02` et `T02` en catégorie
 * `MATERIEL` alors que le §8 du document en fait des **Consommables** et que
 * le JOURNAL les enregistre ainsi. C'est exactement la question Q3 du recueil
 * — la trancher en silence en semant l'une des deux listes reviendrait à
 * répondre à la place de l'utilisateur, sur une classification qui commande
 * ensuite le tarif appliqué.
 *
 * L'écran les propose donc un par un, avec leurs tarifs, et c'est
 * l'utilisateur qui décide de quelle liste ils relèvent.
 */
export function candidatsDepuisReferentiel(referentiel: PeintureReferentiel): TarifPeinture[] {
  return referentiel.tarifs.filter(
    (t) =>
      (t.categorie ?? '').trim().toUpperCase() !== 'STD' &&
      nombre(t.coefficient) === null &&
      (nombre(t.tarifPointageReel) !== null || nombre(t.ancienContrat) !== null)
  )
}

export function consommableDepuisTarif(tarif: TarifPeinture): ConsommablePeintureParametre {
  return {
    nom: tarif.typeItem.trim(),
    // Le §8 annonce « une unité : m² » mais les 382 lignes réelles portent
    // `hr` (cf. Q8) : rien n'est posé ici, l'unité se saisit.
    unite: null,
    prixUnitaireActuel: nombre(tarif.tarifPointageReel),
    prixUnitaireAncien: nombre(tarif.ancienContrat),
  }
}

export function equipementDepuisTarif(tarif: TarifPeinture): EquipementPeintureParametre {
  return {
    nom: tarif.typeItem.trim(),
    tarifUnitaire: nombre(tarif.tarifPointageReel),
    // Le forfait ne se devine pas depuis un tarif : il se déclare.
    auForfait: false,
  }
}

/**
 * Paramètres de départ quand rien n'a encore été enregistré — la reprise sans
 * migration, même patron que le référentiel des devises (18/08/2026) : tant
 * que la collection est vide, l'écran sert ce que le classeur importé porte,
 * et « Enregistrer » écrit ce que l'admin a sous les yeux.
 */
export function parametresDepuisReferentiel(referentiel: PeintureReferentiel): ParametresContratPeinture {
  return {
    equipeReference: { ...EQUIPE_REFERENCE_DOCUMENT },
    sites: sitesDepuisReferentiel(referentiel),
    profils: profilsDepuisReferentiel(referentiel),
    consommables: [],
    equipements: [],
    causesStandBy: causesStandByDepuisReferentiel(referentiel),
  }
}

/**
 * Complète un document lu en base : les champs ajoutés après coup manquent
 * sur les documents déjà enregistrés, et un `undefined` traversant l'écran
 * casserait la saisie. Écrit clé par clé plutôt qu'en étalant des défauts —
 * le type les déclare toutes présentes, TypeScript considérerait donc qu'un
 * spread les écrase toujours (même piège que `normaliserEmploye` côté EPCM).
 */
export function normaliserParametres(lu: Partial<ParametresContratPeinture>): ParametresContratPeinture {
  return {
    equipeReference: {
      chefsEquipe: nombre(lu.equipeReference?.chefsEquipe),
      peintres: nombre(lu.equipeReference?.peintres),
    },
    sites: (lu.sites ?? []).map((s) => ({
      site: s.site,
      nombreHeures: nombre(s.nombreHeures),
      objectifJourM2: nombre(s.objectifJourM2),
      heuresIncompressibles: nombre(s.heuresIncompressibles),
    })),
    profils: (lu.profils ?? []).map((p) => ({ profil: p.profil, coefficient: nombre(p.coefficient) })),
    consommables: (lu.consommables ?? []).map((c) => ({
      nom: c.nom,
      unite: c.unite ?? null,
      prixUnitaireActuel: nombre(c.prixUnitaireActuel),
      prixUnitaireAncien: nombre(c.prixUnitaireAncien),
    })),
    equipements: (lu.equipements ?? []).map((e) => ({
      nom: e.nom,
      tarifUnitaire: nombre(e.tarifUnitaire),
      auForfait: e.auForfait === true,
    })),
    causesStandBy: lu.causesStandBy ?? [],
    ...(lu.misAJourLe ? { misAJourLe: lu.misAJourLe } : {}),
    ...(lu.misAJourPar ? { misAJourPar: lu.misAJourPar } : {}),
  }
}
