import type { Facture, WorkflowFacture } from '../types/project'
import { ecartJours, estRenseignee, raisonEcartAbsent } from './datesPartielles'
import type { RaisonEcartAbsent } from './datesPartielles'

/**
 * Suivi des factures d'un contrat — statut, étapes de validation et KPI de
 * traitement (`doc/module contrat.docx` §5).
 *
 * Toutes les fonctions sont **pures** : elles prennent des factures déjà
 * chargées et ne lisent rien. C'est ce qui permet de les vérifier, et c'est
 * le patron des autres moteurs du projet (`hebdoCrjEngine`,
 * `procurementFollowUpEngine`).
 *
 * **Où vivent les factures.** Elles restent portées par le document de leur
 * commande, et n'ont pas leur propre collection. Le plan initial en prévoyait
 * une, au motif qu'« une facture doit pouvoir exister sans fiche projet » —
 * mais le lot 3 a réglé ce point autrement : une facture suit sa commande, et
 * les commandes sont autonomes depuis. Le document lui-même ne connaît pas de
 * facture sans commande (§5 : « une facture doit pouvoir être rattachée à une
 * commande »), et la première colonne de son fichier de suivi est
 * « COMMANDE ». Une seconde collection aurait donc ajouté une migration et un
 * second modèle sans rien permettre de plus.
 */

export type StatutFacture = 'PAYEE' | 'IMPAYEE'

export const STATUT_FACTURE_LABELS: Record<StatutFacture, string> = {
  PAYEE: 'PAYÉE',
  IMPAYEE: 'IMPAYÉE',
}

/**
 * Statut de la facture (§5, « Statut automatique de la facture ») :
 * « tant que le paiement n'est pas effectué : IMPAYÉE ; lorsque le paiement
 * est effectué : PAYÉE ».
 *
 * **Calculé, jamais saisi.** Le seul critère est le paiement réalisé — pas
 * l'étape atteinte : une facture qui a franchi les cinq premières étapes
 * reste impayée tant que la sixième n'est pas cochée, et c'est exactement ce
 * que le document dit.
 */
export function statutFacture(facture: Pick<Facture, 'workflow'>): StatutFacture {
  return facture.workflow?.paiementRealise ? 'PAYEE' : 'IMPAYEE'
}

export interface EtapeFacture {
  numero: number
  libelle: string
  /** L'étape est-elle franchie ? */
  franchie: (w: WorkflowFacture) => boolean
}

/**
 * Les **sept** étapes, dans l'ordre des deux documents.
 *
 * Les six premières lignes venaient du §5 de `module contrat.docx` ; la
 * cinquième — **Validation DO** — est celle que `module contrat_rev01.docx`
 * §2 signale comme oubliée, et sa place est celle que le document lui donne :
 * après le traitement CGE, avant le paiement.
 *
 * Une étape est franchie **par sa date** quand le document n'en demande
 * qu'une, par son Oui/Non sinon. La Validation DO suit ce second régime : son
 * département et sa date sont des précisions, c'est le Oui qui la franchit.
 */
export const ETAPES_FACTURE: EtapeFacture[] = [
  { numero: 1, libelle: 'Validation technique', franchie: (w) => estRenseignee(w.dateValidationTechnique) },
  { numero: 2, libelle: 'Transmise à la comptabilité', franchie: (w) => estRenseignee(w.dateTransmissionCompta) },
  { numero: 3, libelle: 'Introduite dans SAP', franchie: (w) => w.introduiteSap === true },
  { numero: 4, libelle: 'Traitement CGE', franchie: (w) => w.traitementCge === true },
  { numero: 5, libelle: 'Validation DO', franchie: (w) => w.validationDo === true },
  { numero: 6, libelle: 'Paiement en cours', franchie: (w) => w.paiementEnCours === true },
  { numero: 7, libelle: 'Paiement réalisé', franchie: (w) => w.paiementRealise === true },
]

/** Le nombre d'étapes, pour que les écrans n'écrivent pas « /6 » en dur. */
export const NOMBRE_ETAPES = ETAPES_FACTURE.length

/**
 * Numéro de la dernière étape franchie, `0` si aucune.
 *
 * C'est **la plus avancée** des étapes franchies, et non la première non
 * franchie : le document décrit un parcours, mais rien n'oblige la réalité à
 * le suivre dans l'ordre — une facture peut être introduite dans SAP avant
 * que la date de validation technique n'ait été notée. Prendre la première
 * lacune ferait reculer l'avancement d'une facture pour un champ oublié.
 */
export function etapeCourante(facture: Pick<Facture, 'workflow'>): number {
  const w = facture.workflow
  if (!w) return 0
  return ETAPES_FACTURE.reduce((max, e) => (e.franchie(w) ? e.numero : max), 0)
}

/**
 * Étapes non franchies qui précèdent la dernière franchie (§5 : « lorsque le
 * paiement est réalisé, toutes les étapes précédentes doivent être
 * validées »).
 *
 * **C'est un avertissement, pas un blocage.** Refuser d'enregistrer un
 * paiement parce qu'une date de SAP n'a pas été notée ferait perdre la seule
 * information dont dispose l'utilisateur — le paiement a eu lieu. Même
 * traitement que « un risque sans mitigation » ou « un point bloquant sans
 * mitigation » ailleurs dans l'application : on signale, on n'empêche pas.
 *
 * Rend une liste vide tant qu'aucune étape n'est franchie.
 */
export function etapesManquantes(facture: Pick<Facture, 'workflow'>): string[] {
  const w = facture.workflow
  if (!w) return []
  const atteinte = etapeCourante(facture)
  return ETAPES_FACTURE.filter((e) => e.numero < atteinte && !e.franchie(w)).map((e) => e.libelle)
}

export interface DelaisFacture {
  /**
   * **SAP → paiement** — « KPI principal à suivre : Délai entre la date de
   * chargement dans SAP et la date de paiement de la facture » (rev01 §3).
   * En tête, parce que le document le désigne comme principal.
   */
  sapAPaiement: number | null
  /** Réception → validation technique. */
  receptionAValidation: number | null
  /** Validation technique → transmission à la comptabilité. */
  validationACompta: number | null
  /** Transmission à la comptabilité → paiement. */
  comptaAPaiement: number | null
  /** Réception → paiement : le délai de bout en bout. */
  receptionAPaiement: number | null
}

/** Les deux bornes de chaque délai, dans l'ordre d'affichage. */
function bornes(facture: Pick<Facture, 'dateReception' | 'workflow'>): Record<keyof DelaisFacture, [string | undefined, string | undefined]> {
  const w = facture.workflow ?? {}
  return {
    sapAPaiement: [w.dateIntroductionSap, w.datePaiement],
    receptionAValidation: [facture.dateReception, w.dateValidationTechnique],
    validationACompta: [w.dateValidationTechnique, w.dateTransmissionCompta],
    comptaAPaiement: [w.dateTransmissionCompta, w.datePaiement],
    receptionAPaiement: [facture.dateReception, w.datePaiement],
  }
}

export const CLES_DELAIS: (keyof DelaisFacture)[] = [
  'sapAPaiement',
  'receptionAValidation',
  'validationACompta',
  'comptaAPaiement',
  'receptionAPaiement',
]

export const LIBELLES_DELAIS: Record<keyof DelaisFacture, string> = {
  sapAPaiement: 'Chargement SAP → paiement',
  receptionAValidation: 'Réception → validation',
  validationACompta: 'Validation → comptabilité',
  comptaAPaiement: 'Comptabilité → paiement',
  receptionAPaiement: 'Réception → paiement',
}

/**
 * KPI de traitement — ceux du §5 de `module contrat.docx` (« délai entre
 * réception de la facture, transmission à la comptabilité et paiement
 * final »), plus celui que `module contrat_rev01.docx` §3 désigne comme **le
 * principal** : chargement dans SAP → paiement, « calculé dès que les deux
 * dates sont renseignées ».
 *
 * **Une borne manquante rend `null`, jamais `0`** : un délai inconnu n'est pas
 * un délai nul, et le compter pour zéro tirerait toutes les moyennes vers le
 * bas sans que rien ne le dise. **Une borne connue au mois près rend `null`
 * aussi** — le rev01 autorise cette saisie sans dire sur quel jour du mois
 * compter (cf. `lib/datesPartielles.ts`) ; `raisonDelaiAbsent` permet à
 * l'écran de distinguer les deux cas au lieu de les confondre sous un tiret.
 */
export function delaisFacture(facture: Pick<Facture, 'dateReception' | 'workflow'>): DelaisFacture {
  const b = bornes(facture)
  return Object.fromEntries(CLES_DELAIS.map((cle) => [cle, ecartJours(b[cle][0], b[cle][1])])) as unknown as DelaisFacture
}

/**
 * Pourquoi un délai n'est pas calculé — `null` quand il l'est. Une borne
 * absente (`'bornes'`) et une borne au mois près (`'precision'`) n'appellent
 * pas la même action : la première se renseigne, la seconde se précise.
 */
export function raisonDelaiAbsent(
  facture: Pick<Facture, 'dateReception' | 'workflow'>,
  cle: keyof DelaisFacture
): RaisonEcartAbsent | null {
  const [debut, fin] = bornes(facture)[cle]
  return raisonEcartAbsent(debut, fin)
}

export interface MoyenneDelai {
  /** Moyenne en jours, arrondie — `null` si aucune facture ne la renseigne. */
  valeur: number | null
  /** Sur combien de factures elle porte : une moyenne sans son effectif ne se juge pas. */
  nombre: number
}

/**
 * Moyennes des délais sur un ensemble de factures.
 *
 * **N'agrège que les factures dont les deux bornes existent et sont connues
 * au jour**, et dit sur combien elle porte — sinon une moyenne calculée sur
 * 2 factures parmi 40 passerait pour la mesure du contrat.
 */
export function moyennesDelais(factures: Pick<Facture, 'dateReception' | 'workflow'>[]): Record<keyof DelaisFacture, MoyenneDelai> {
  const cles = CLES_DELAIS
  const tous = factures.map(delaisFacture)
  return Object.fromEntries(
    cles.map((cle) => {
      const valeurs = tous.map((d) => d[cle]).filter((v): v is number => v !== null)
      return [
        cle,
        {
          valeur: valeurs.length > 0 ? Math.round(valeurs.reduce((s, v) => s + v, 0) / valeurs.length) : null,
          nombre: valeurs.length,
        },
      ]
    })
  ) as Record<keyof DelaisFacture, MoyenneDelai>
}

export interface ResumeFactures {
  nombre: number
  /** Montant HT cumulé. */
  total: number
  /** Montant HT des factures payées. */
  paye: number
  /** Montant HT des factures impayées. */
  impaye: number
  nombrePayees: number
  nombreImpayees: number
  /** Combien de factures sont arrêtées à chaque étape (index 0 = aucune étape franchie). */
  parEtape: number[]
}

/** Compteurs d'un ensemble de factures — l'en-tête du suivi d'un contrat. */
export function resumeFactures(factures: Facture[]): ResumeFactures {
  const parEtape = Array(ETAPES_FACTURE.length + 1).fill(0) as number[]
  let paye = 0
  let impaye = 0
  for (const f of factures) {
    parEtape[etapeCourante(f)] += 1
    if (statutFacture(f) === 'PAYEE') paye += f.montant
    else impaye += f.montant
  }
  return {
    nombre: factures.length,
    total: paye + impaye,
    paye,
    impaye,
    nombrePayees: factures.filter((f) => statutFacture(f) === 'PAYEE').length,
    nombreImpayees: factures.filter((f) => statutFacture(f) === 'IMPAYEE').length,
    parEtape,
  }
}
