import { arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { chargerDonnee } from './firestoreData'
import { COLLECTIONS, SOUS_COLLECTION_AVC, SOUS_COLLECTION_CONSOMMATIONS, idDocument } from './firestoreCollections'
import { listerCommandes } from './commandesEngine'
import { montantActuelCommande, totalFactureCommande } from '../types/project'
import type { AffaireMetal } from '../types/travauxMetal'
import type { LigneJournalPeinture } from '../types/contratPeinture'

// Port client-side de l'ex-ContratsService (app_icp_api, abandonnée le
// 22/07/2026, cf. CLAUDE.md) : contrats portfolio (Logique_metier_liaisons_
// ICP.docx Phase 2 — Valeur Cible vs consommation réelle dérivée, « plus de
// saisie » pour Métal/Échafaudage/Peinture). Lit directement Firestore.

export type TypeContrat = 'METAL' | 'TIG' | 'PEINTURE' | 'ECHAFAUDAGE' | 'PERSONNEL_EPCM' | 'PLONGEE' | 'TOPOGRAPHIE'

// Option de renouvellement (retour utilisateur : "on signe 3 ans mais avec
// options de renouvellement 1 an + 1 an") — chaque option est indépendante,
// exercée ou non ; exercer une option prolonge `dateFin` du contrat de sa
// durée (cf. exercerOptionRenouvellement).
export interface OptionRenouvellement {
  id: string
  dureeAns: number
  exercee: boolean
  dateExercice?: string
}

/**
 * Responsable d'un contrat, côté client ou côté fournisseur (`doc/module
 * contrat.docx` §1) — nom et adresse e-mail.
 *
 * **Texte libre et non un compte de l'annuaire** : le responsable côté
 * fournisseur n'a pas de compte dans l'application, et le document donne les
 * deux sous la même forme (« Guillaume Mercier / guillaume.mercier@… »).
 */
export interface ResponsableContrat {
  nom: string
  /** Absente quand seul le nom est connu — on ne devine pas une adresse. */
  email?: string
}

/**
 * Augmentation de Valeur Cible (`doc/module contrat.docx` §2) — « il est
 * important de prévoir la gestion des augmentations de valeur cible lorsque
 * le budget initial risque d'être dépassé ».
 *
 * Exemple du document : VC initiale 2 000 000 USD, engagements constatés à la
 * 2ᵉ année 1 900 000 USD, nouvelle VC décidée 3 000 000 USD → **AVC n°1 :
 * +1 000 000 USD**. C'est donc bien le **montant ajouté** qui est saisi, pas
 * la nouvelle valeur cible : c'est lui que le document nomme « l'augmentation ».
 */
interface AvcDoc {
  /** ISO `YYYY-MM-DD` — date de l'augmentation, décidée par le management. */
  date: string
  montantAjoute: number
  commentaire?: string
  /** Qui a enregistré l'augmentation, et quand — un historique se signe. */
  saisiPar?: string
  saisiLe: string
}

export interface AvcContrat extends AvcDoc {
  id: string
  /**
   * Rang chronologique (1 = AVC1, 2 = AVC2…), **calculé à la lecture et non
   * stocké** : le numéro d'un AVC n'est que sa place dans la suite, le
   * stocker permettrait à deux AVC de porter le même rang.
   */
  numero: number
}

interface ContratDoc {
  reference: string
  /**
   * Objet du contrat en clair (`doc/module contrat.docx` §1 : « Assistance
   * Technique Maintenance Offshore ») — « cela permettra d'identifier
   * rapidement l'objet du contrat sans se limiter à une référence ou un
   * numéro ».
   *
   * Facultatif : les contrats déjà en base n'en ont pas, et le déduire de la
   * référence inventerait une donnée. L'écran affiche alors la référence
   * seule.
   */
  intitule?: string
  type: TypeContrat
  fournisseurId: string
  dateDebut: string
  dateFin: string
  valeurCible: number
  projetIds: string[]
  suiviPo?: { bc: string; valeurCible: number | null }[]
  optionsRenouvellement?: OptionRenouvellement[]
  responsableClient?: ResponsableContrat
  responsableFournisseur?: ResponsableContrat
  /**
   * Zone de suivi libre (`doc/module contrat.docx` §5, « Commentaires ») :
   * points bloquants, relances, anomalies. Un champ, pas un fil horodaté —
   * même convention que `LigneNavette.commentaire`.
   */
  commentaire?: string
}

interface FournisseurDoc {
  nom: string
  alias: string[]
}

interface ConsommationContratDoc {
  annee: number
  mois: number
  montant: number
  source: 'CALCULEE' | 'MANUELLE'
}

export interface ConsommationBc {
  bc: string
  valeurCible: number | null
  consommation: number
  /**
   * D'où vient la ligne (04/09/2026, lot 6 METAL, `doc/TRAVAUX METAL.docx`
   * "DATA TRAVAUX MÉTAL") : `'commande'` = une commande vivante du module
   * Contrat (`commandes`, `contratId` = ce contrat) — valeur cible et
   * consommation modifiables depuis là (AVC, factures) ; absent = repris tel
   * quel du classeur importé (`contrat.suiviPo`), jamais modifiable dans
   * l'application.
   */
  origine?: 'commande'
}

export interface ConsommationEntree {
  id: string
  annee: number
  mois: number
  montant: number
}

export interface ContratListe {
  id: string
  reference: string
  intitule?: string
  type: TypeContrat
  // Déjà servi par `listerContrats` (spread du document) mais jusqu'ici absent
  // du type : il est nécessaire pour préremplir le formulaire de modification.
  fournisseurId: string
  dateDebut: string
  dateFin: string
  valeurCible: number
  projetIds: string[]
  optionsRenouvellement?: OptionRenouvellement[]
  responsableClient?: ResponsableContrat
  responsableFournisseur?: ResponsableContrat
  commentaire?: string
  /**
   * Augmentations de valeur cible, du plus ancien au plus récent.
   * `valeurCible` reste **la valeur cible initiale** : l'actuelle se lit par
   * `valeurCibleActuelle()`, jamais recopiée dans le document (une valeur
   * recopiée devient fausse à la première modification de sa source).
   */
  avc: AvcContrat[]
  consommation: number
  pct: number
  fournisseur: { nom: string } | null
}

// Point d'une courbe de consommation dans le temps (CDS §8 : "évolution de
// la consommation"), regroupé par mois (YYYY-MM).
export interface PointEvolution {
  periode: string
  montant: number
}

// Répartition par service consommateur (CDS §8 : "les services
// consommateurs") — disponible seulement quand la donnée source porte
// vraiment un service (Échafaudage/facturation GMI).
export interface PartService {
  service: string
  montant: number
}

export interface ContratDetail extends Omit<ContratListe, 'consommation' | 'pct'> {
  projets: { id: string; nom: string }[]
  consommation:
    | {
        total: number
        horsBc: number
        parBc: ConsommationBc[]
        libelleCle?: string
        evolution?: PointEvolution[]
        parService?: PartService[]
      }
    | {
        total: number
        entrees: ConsommationEntree[]
        /** Part saisie à la main, mois par mois. */
        totalSaisi: number
        /** Part tirée des factures des commandes rattachées (lot 6). */
        totalCommandes: number
        nombreCommandes: number
      }
}

export interface CreerContratInput {
  reference: string
  intitule?: string
  type: TypeContrat
  fournisseurId: string
  dateDebut: string
  dateFin: string
  valeurCible: number
  optionsRenouvellement?: { dureeAns: number }[]
  responsableClient?: ResponsableContrat
  responsableFournisseur?: ResponsableContrat
  commentaire?: string
}

/**
 * Modification d'un contrat existant.
 *
 * **La référence n'y figure pas** : elle est l'identifiant du document
 * Firestore (`idDocument(reference)`), la changer reviendrait à créer un
 * autre contrat et à abandonner celui-ci avec tout ce qui pointe dessus —
 * `Commande.contratId`, `projetIds`, ses consommations. Même règle que le
 * code OTP d'une ligne navette.
 *
 * Les champs facultatifs vidés sont **retirés** du document (`deleteField`)
 * plutôt qu'écrits à `null`, qui distinguerait mal « pas saisi » de
 * « effacé ».
 */
export interface ModifierContratInput {
  intitule?: string
  type: TypeContrat
  fournisseurId: string
  dateDebut: string
  dateFin: string
  valeurCible: number
  responsableClient?: ResponsableContrat
  responsableFournisseur?: ResponsableContrat
  commentaire?: string
}

export interface AjouterConsommationInput {
  annee: number
  mois: number
  montant: number
}

// Regroupe des montants par mois (clé "YYYY-MM" tirée des 7 premiers
// caractères d'une date ISO), triés chronologiquement — sert de courbe
// d'évolution (CDS §8).
function regrouperParMois(entrees: { date: string; montant: number }[]): PointEvolution[] {
  const parMois = new Map<string, number>()
  for (const e of entrees) {
    const periode = e.date.slice(0, 7)
    parMois.set(periode, (parMois.get(periode) ?? 0) + e.montant)
  }
  return [...parMois.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periode, montant]) => ({ periode, montant }))
}

/**
 * Consommation du contrat Métal, dérivée de **deux sources cohabitantes**
 * (04/09/2026, lot 6 — `doc/TRAVAUX METAL.docx`, "DATA TRAVAUX MÉTAL", Q3
 * tranchée pour l'option A du recueil : réutiliser le mécanisme générique du
 * module Contrat plutôt qu'en construire un propre à METAL) :
 *
 * - les BC **historiques**, importés du classeur (`contrat.suiviPo` — en
 *   pratique jamais peuplé par l'application, aucun formulaire ne l'écrit),
 *   dont la consommation reste calculée depuis `AffaireMetal.coutReel`
 *   groupé par `po` (Logique_metier_liaisons_ICP.docx §3.3 : « plus de
 *   saisie ») — aucune commande ni facture n'existe pour ces lignes,
 *   inventer l'une ou l'autre serait halluciner une donnée ;
 * - les commandes **vivantes**, créées depuis le module Contrat
 *   (`commandes`, `contratId` = ce contrat) : leur valeur cible actuelle
 *   (initiale + AVC, MET-48/49) et leur consommation — la somme de leurs
 *   factures (MET-50/51 : « la colonne Consommation doit donc représenter
 *   l'ensemble des montants facturés associés à cette commande »).
 *
 * Une commande dont le numéro coïncide avec un BC historique **remplace** la
 * ligne figée dans `parBc` : c'est la commande, vivante, qui fait foi.
 * `origine: 'commande'` marque les lignes modifiables (valeur cible, AVC,
 * factures) depuis le module Contrats — `ReferentielTab.tsx` ("Data Travaux
 * METAL") n'en est qu'une **vue de lecture**, exactement comme le recueil le
 * demande ; créer une commande, l'augmenter ou lui rattacher une facture se
 * fait toujours dans `ContratsPage` (`CommandesDuContrat`/
 * `AugmentationsCommande`/`FacturesDuContrat`, déjà génériques à tout type de
 * contrat, aucun code n'y a été ajouté pour METAL).
 *
 * Pas de courbe d'évolution : les affaires n'ont pas de date de coût fiable
 * (`dateFinReel` souvent absente même quand `coutReel` est renseigné).
 */
async function consommationMetal(contrat: ContratDoc, contratId: string) {
  const [snap, commandes] = await Promise.all([getDocs(collection(db, COLLECTIONS.affairesMetal)), listerCommandes()])
  const parPo = new Map<string, number>()
  let horsBc = 0
  for (const d of snap.docs) {
    const a = d.data() as AffaireMetal
    if (!a.coutReel) continue
    if (a.po) parPo.set(a.po, (parPo.get(a.po) ?? 0) + a.coutReel)
    else horsBc += a.coutReel
  }
  const parBc = new Map<string, ConsommationBc>()
  for (const p of contrat.suiviPo ?? []) {
    parBc.set(p.bc, { bc: p.bc, valeurCible: p.valeurCible, consommation: parPo.get(p.bc) ?? 0 })
  }
  for (const c of commandes) {
    if (c.contratId !== contratId) continue
    parBc.set(c.numero, {
      bc: c.numero,
      valeurCible: montantActuelCommande(c),
      consommation: totalFactureCommande(c),
      origine: 'commande',
    })
  }
  const lignes = [...parBc.values()]
  const total = lignes.reduce((s, p) => s + p.consommation, 0) + horsBc
  return { parBc: lignes, horsBc, total }
}

/**
 * Consommation du contrat Échafaudage GMI. Total retenu = `synthese.realise`
 * (feuille SYNTHESE du classeur, déjà la référence affichée dans l'onglet
 * Facturation au point) plutôt que la somme des factures (périodes de
 * mesure différentes — assumé, cf. app_icp_api/CLAUDE.md).
 */
async function consommationEchafaudage() {
  const [facturation, synthese] = await Promise.all([
    chargerDonnee<{ factures: { bonCommande: string | null; montant: number | null; mois: string | null; service: string | null }[] }>(
      'facturation-point__facturation-gmi'
    ),
    chargerDonnee<{ realise: number }>('facturation-point__synthese'),
  ])
  const parBonCommande = new Map<string, number>()
  const parService = new Map<string, number>()
  let horsBc = 0
  for (const f of facturation.factures) {
    if (!f.montant) continue
    if (f.bonCommande) parBonCommande.set(f.bonCommande, (parBonCommande.get(f.bonCommande) ?? 0) + f.montant)
    else horsBc += f.montant
    const service = f.service ?? 'Non renseigné'
    parService.set(service, (parService.get(service) ?? 0) + f.montant)
  }
  const parBc: ConsommationBc[] = [...parBonCommande.entries()].map(([bc, consommation]) => ({ bc, valeurCible: null, consommation }))
  // `mois` est une date ISO complète ("2022-03-30"), pas juste un mois — le
  // champ garde ce nom pour rester fidèle au classeur source.
  const evolution = regrouperParMois(facturation.factures.filter((f) => f.mois && f.montant).map((f) => ({ date: f.mois as string, montant: f.montant as number })))
  const parServiceListe: PartService[] = [...parService.entries()]
    .map(([service, montant]) => ({ service, montant }))
    .sort((a, b) => b.montant - a.montant)
  return { parBc, horsBc, total: synthese.realise, evolution, parService: parServiceListe }
}

/**
 * Consommation du contrat Peinture GMI, dérivée du coût au pointage du
 * journal, regroupé par site (pas de PO/BC pour ce contrat).
 */
async function consommationPeinture() {
  const snap = await getDocs(collection(db, COLLECTIONS.journalPeinture))
  const parSite = new Map<string, number>()
  const lignes: { date: string; montant: number }[] = []
  let horsSite = 0
  for (const d of snap.docs) {
    const l = d.data() as LigneJournalPeinture
    const cout = l.coutTotalPointage ?? 0
    if (l.site) parSite.set(l.site, (parSite.get(l.site) ?? 0) + cout)
    else horsSite += cout
    if (cout && l.date) lignes.push({ date: l.date, montant: cout })
  }
  const parBc: ConsommationBc[] = [...parSite.entries()]
    .map(([bc, consommation]) => ({ bc, valeurCible: null, consommation }))
    .sort((a, b) => b.consommation - a.consommation)
  const total = parBc.reduce((s, p) => s + p.consommation, 0) + horsSite
  return { parBc, horsBc: horsSite, total, libelleCle: 'Site', evolution: regrouperParMois(lignes) }
}

/**
 * Consommation tirée des **factures des commandes** rattachées au contrat
 * (`doc/module contrat.docx`, « Bénéfice attendu » : suivi des consommations).
 *
 * Ce branchement n'était pas possible avant le lot 3 : une commande vivait
 * dans le document de sa fiche projet, et l'atteindre depuis le référentiel
 * des contrats aurait demandé de charger toutes les fiches. Depuis que les
 * commandes ont leur collection, une seule lecture suffit.
 *
 * **Ce qui compte est la facture, pas la commande** : une commande passée est
 * un engagement, pas une consommation — c'est ce qui est facturé qui a été
 * consommé. C'est la règle qu'appliquait déjà l'onglet Contrats d'une fiche
 * projet.
 *
 * **Limite connue** : les commandes restées dans le document d'une fiche
 * (celles d'avant la migration de Paramètres › Maintenance) ne sont pas vues
 * ici. Les écrans le signalent plutôt que de laisser croire à un total
 * complet.
 */
async function consommationCommandes(contratId: string): Promise<{ total: number; nombre: number }> {
  const snap = await getDocs(collection(db, COLLECTIONS.commandes))
  const commandes = snap.docs
    .map((d) => d.data() as { contratId?: string | null; factures?: { montant: number }[] })
    .filter((c) => c.contratId === contratId)
  return {
    total: commandes.reduce((s, c) => s + (c.factures ?? []).reduce((t, f) => t + f.montant, 0), 0),
    nombre: commandes.length,
  }
}

/**
 * Contrats sans dérivation automatique (TIG, Personnel EPCM, Plongée,
 * Topographie) : saisie manuelle en fallback, une entrée par (année, mois),
 * **plus les factures de leurs commandes** (lot 6).
 *
 * Les deux sources sont gardées séparées (`totalSaisi` / `totalCommandes`) et
 * non fondues dans un seul nombre : sans ça, un écran ne pourrait plus dire
 * d'où vient un montant, et une même dépense saisie à la main *et* facturée
 * sur une commande passerait pour deux consommations sans qu'on puisse le
 * voir.
 */
async function consommationManuelle(contratId: string) {
  const [snap, commandes] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.contrats, contratId, SOUS_COLLECTION_CONSOMMATIONS)),
    consommationCommandes(contratId),
  ])
  const entrees = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ConsommationContratDoc) }))
    .sort((a, b) => a.annee - b.annee || a.mois - b.mois)
  const totalSaisi = entrees.reduce((s, e) => s + e.montant, 0)
  return {
    entrees,
    totalSaisi,
    totalCommandes: commandes.total,
    nombreCommandes: commandes.nombre,
    total: totalSaisi + commandes.total,
  }
}

async function consommation(id: string, contrat: ContratDoc) {
  if (contrat.type === 'METAL') return consommationMetal(contrat, id)
  if (contrat.type === 'ECHAFAUDAGE') return consommationEchafaudage()
  if (contrat.type === 'PEINTURE') return consommationPeinture()
  return consommationManuelle(id)
}

/**
 * Charge les AVC d'un contrat, du plus ancien au plus récent, et leur donne
 * leur numéro (AVC1, AVC2…). Deux augmentations du même jour sont départagées
 * par leur horodatage de saisie : sans ce second critère, leur ordre — donc
 * leur numéro — changerait d'un chargement à l'autre.
 */
async function chargerAvc(contratId: string): Promise<AvcContrat[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.contrats, contratId, SOUS_COLLECTION_AVC))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as AvcDoc) }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.saisiLe ?? '').localeCompare(b.saisiLe ?? ''))
    .map((a, i) => ({ ...a, numero: i + 1 }))
}

/**
 * Valeur cible **actuelle** = valeur cible initiale + somme des AVC
 * (`doc/module contrat.docx` §2).
 *
 * C'est elle que doivent lire les taux de consommation, les dépassements et
 * les cumuls — `valeurCible` reste la valeur *initiale*, celle qui a été
 * signée. Le total n'est jamais recopié dans le document : un chiffre recopié
 * devient faux dès qu'un AVC est ajouté (même raison que les résumés
 * Procurement et les KPI du Grand arrêt).
 */
export function valeurCibleActuelle(contrat: { valeurCible: number; avc?: AvcContrat[] }): number {
  return contrat.valeurCible + (contrat.avc ?? []).reduce((s, a) => s + a.montantAjoute, 0)
}

/**
 * Évolution de la valeur cible dans le temps, en **escalier** : une marche à
 * la date de chaque AVC (`doc/module contrat.docx` §2, « afficher correctement
 * l'évolution de la valeur cible sur les graphiques de suivi des
 * consommations »).
 *
 * Rendue sur les périodes `YYYY-MM` de la courbe de consommation qu'elle
 * accompagne, pour que les deux séries partagent exactement le même axe. Une
 * augmentation antérieure à la première période est déjà comprise dans la
 * valeur de départ — elle ne crée pas une marche hors du graphique.
 */
export function paliersValeurCible(
  contrat: { valeurCible: number; avc?: AvcContrat[] },
  periodes: string[]
): PointEvolution[] {
  const avc = contrat.avc ?? []
  return periodes.map((periode) => ({
    periode,
    montant:
      contrat.valeurCible +
      avc.filter((a) => a.date.slice(0, 7) <= periode).reduce((s, a) => s + a.montantAjoute, 0),
  }))
}

export interface AjouterAvcInput {
  date: string
  montantAjoute: number
  commentaire?: string
  /** Nom de la personne connectée — un historique se signe. */
  saisiPar?: string
}

/**
 * Enregistre une augmentation de valeur cible.
 *
 * Un AVC **n'écrase jamais `valeurCible`** : la valeur initiale reste celle
 * qui a été signée, et l'actuelle se déduit (cf. `valeurCibleActuelle`).
 * L'identifiant est un UUID : deux augmentations peuvent porter la même date
 * et le même montant sans qu'aucune n'en écrase une autre.
 */
export async function ajouterAvcContrat(contratId: string, input: AjouterAvcInput): Promise<void> {
  const contratRef = doc(db, COLLECTIONS.contrats, contratId)
  if (!(await getDoc(contratRef)).exists()) throw new Error(`Contrat ${contratId} introuvable`)
  const entree: AvcDoc = sansVides({
    date: input.date,
    montantAjoute: input.montantAjoute,
    commentaire: input.commentaire?.trim(),
    saisiPar: input.saisiPar,
    saisiLe: new Date().toISOString(),
  })
  await setDoc(doc(db, COLLECTIONS.contrats, contratId, SOUS_COLLECTION_AVC, crypto.randomUUID()), entree)
}

/**
 * Retire les clés dont la valeur est `undefined` (refusées par Firestore) et
 * celles dont la chaîne est vide — un intitulé laissé vide ne doit pas
 * s'écrire comme une chaîne vide, qui se lirait ensuite comme « renseigné,
 * mais avec rien dedans ». Même principe que `sansIndefinis` de
 * `NavetteContext`.
 */
function sansVides<T extends object>(donnees: T): T {
  return Object.fromEntries(Object.entries(donnees).filter(([, v]) => v !== undefined && v !== '')) as T
}

/**
 * Nettoie un responsable saisi : le nom est ce qui le fait exister (une
 * adresse e-mail seule ne désigne personne dans les écrans), une adresse vide
 * est simplement absente.
 */
function responsableNettoye(r: ResponsableContrat | undefined): ResponsableContrat | undefined {
  const nom = r?.nom?.trim()
  if (!nom) return undefined
  const email = r?.email?.trim()
  return email ? { nom, email } : { nom }
}

export async function creerContrat(input: CreerContratInput): Promise<{ id: string } & ContratDoc> {
  const id = idDocument(input.reference)
  const ref = doc(db, COLLECTIONS.contrats, id)
  if ((await getDoc(ref)).exists()) throw new Error(`Référence contrat déjà utilisée : ${input.reference}`)
  const { optionsRenouvellement, responsableClient, responsableFournisseur, ...reste } = input
  const contrat: ContratDoc = sansVides({
    ...reste,
    projetIds: [],
    // Firestore rejette les tableaux vides à la limite mais surtout on évite
    // d'écrire une clé inutile quand aucune option n'est saisie.
    ...(optionsRenouvellement && optionsRenouvellement.length > 0
      ? { optionsRenouvellement: optionsRenouvellement.map((o) => ({ id: crypto.randomUUID(), dureeAns: o.dureeAns, exercee: false })) }
      : {}),
    responsableClient: responsableNettoye(responsableClient),
    responsableFournisseur: responsableNettoye(responsableFournisseur),
  })
  await setDoc(ref, contrat)
  return { id, ...contrat }
}

/**
 * Modifie un contrat existant (`doc/module contrat.docx` §1) — il n'existait
 * jusqu'ici **aucun chemin de modification** : sans lui, l'intitulé et les
 * deux responsables n'auraient pu être renseignés que sur les contrats créés
 * après ce jour.
 *
 * Ne touche ni à `projetIds`, ni aux options de renouvellement, ni aux
 * consommations : chacun a son propre geste, et un `setDoc` complet les
 * effacerait.
 */
export async function modifierContrat(id: string, input: ModifierContratInput): Promise<void> {
  const ref = doc(db, COLLECTIONS.contrats, id)
  if (!(await getDoc(ref)).exists()) throw new Error(`Contrat ${id} introuvable`)

  const client = responsableNettoye(input.responsableClient)
  const fournisseur = responsableNettoye(input.responsableFournisseur)
  const intitule = input.intitule?.trim()
  const commentaire = input.commentaire?.trim()

  await updateDoc(ref, {
    type: input.type,
    fournisseurId: input.fournisseurId,
    dateDebut: input.dateDebut,
    dateFin: input.dateFin,
    valeurCible: input.valeurCible,
    intitule: intitule ? intitule : deleteField(),
    responsableClient: client ?? deleteField(),
    responsableFournisseur: fournisseur ?? deleteField(),
    commentaire: commentaire ? commentaire : deleteField(),
  })
}

/**
 * Supprime définitivement un contrat (04/09/2026, demande explicite).
 *
 * Nettoie ce qui peut l'être avant de retirer le document — les entrées de
 * consommation saisie (`consommations`, en écriture libre côté règles) — mais
 * laisse deux choses volontairement orphelines, que l'écran de confirmation
 * dit avant d'agir :
 *  - les AVC (`avc`) : `firestore.rules` les rend indélébiles, même pour un
 *    admin, cf. `ajouterAvcContrat` (un historique de budget déjà arbitré ne
 *    se réécrit pas) ;
 *  - les commandes dont `contratId` pointe sur ce contrat : elles vivent dans
 *    leur propre collection (`commandes`) et ne sont pas supprimées avec
 *    lui — même principe que `supprimerLigne` côté navette, qui détache
 *    l'historique des arbitrages sans l'effacer.
 */
export async function supprimerContrat(id: string): Promise<void> {
  const consommations = await getDocs(collection(db, COLLECTIONS.contrats, id, SOUS_COLLECTION_CONSOMMATIONS))
  await Promise.all(consommations.docs.map((d) => deleteDoc(d.ref)))
  await deleteDoc(doc(db, COLLECTIONS.contrats, id))
}

// Exerce une option de renouvellement : prolonge `dateFin` du contrat de la
// durée de l'option (retour utilisateur : "3 ans avec options de
// renouvellement 1 an + 1 an") et marque l'option comme exercée.
export async function exercerOptionRenouvellement(contratId: string, optionId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.contrats, contratId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error(`Contrat ${contratId} introuvable`)
  const contrat = snap.data() as ContratDoc
  const option = (contrat.optionsRenouvellement ?? []).find((o) => o.id === optionId)
  if (!option) throw new Error(`Option de renouvellement ${optionId} introuvable`)
  if (option.exercee) throw new Error('Cette option a déjà été exercée.')

  const nouvelleDateFin = new Date(contrat.dateFin)
  nouvelleDateFin.setFullYear(nouvelleDateFin.getFullYear() + option.dureeAns)
  const dateExercice = new Date().toISOString().slice(0, 10)

  await updateDoc(ref, {
    dateFin: nouvelleDateFin.toISOString().slice(0, 10),
    optionsRenouvellement: (contrat.optionsRenouvellement ?? []).map((o) =>
      o.id === optionId ? { ...o, exercee: true, dateExercice } : o
    ),
  })
}

// Liaison contrat ↔ projet (retour utilisateur : rattacher un contrat du
// référentiel portfolio à une ou plusieurs fiches projet) — jusqu'ici
// `projetIds` n'était écrit qu'à la création (toujours `[]`), jamais modifié.
export async function lierProjet(contratId: string, projetId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.contrats, contratId), { projetIds: arrayUnion(projetId) })
}

export async function delierProjet(contratId: string, projetId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.contrats, contratId), { projetIds: arrayRemove(projetId) })
}

export async function ajouterConsommationContrat(contratId: string, input: AjouterConsommationInput) {
  const contratRef = doc(db, COLLECTIONS.contrats, contratId)
  if (!(await getDoc(contratRef)).exists()) throw new Error(`Contrat ${contratId} introuvable`)
  const entree: ConsommationContratDoc = { annee: input.annee, mois: input.mois, montant: input.montant, source: 'MANUELLE' }
  // Une entrée par (année, mois, source) : ré-enregistrer le même mois met à
  // jour le montant plutôt que d'empiler des doublons.
  const id = `${input.annee}-${input.mois}-MANUELLE`
  await setDoc(doc(db, COLLECTIONS.contrats, contratId, SOUS_COLLECTION_CONSOMMATIONS, id), entree)
  return { id, ...entree }
}

export async function listerContrats(): Promise<ContratListe[]> {
  const [contrats, fournisseurs] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.contrats)),
    getDocs(collection(db, COLLECTIONS.fournisseurs)),
  ])
  const parFournisseur = new Map(fournisseurs.docs.map((d) => [d.id, d.data() as FournisseurDoc]))

  return Promise.all(
    contrats.docs.map(async (d) => {
      const contrat = d.data() as ContratDoc
      const [{ total }, avc] = await Promise.all([consommation(d.id, contrat), chargerAvc(d.id)])
      // Le taux se mesure contre la valeur cible **actuelle** (initiale + AVC) :
      // rapporté à l'initiale, il continuerait d'annoncer un dépassement après
      // une augmentation qui l'a précisément levé.
      const cible = valeurCibleActuelle({ valeurCible: contrat.valeurCible, avc })
      return {
        id: d.id,
        ...contrat,
        avc,
        fournisseur: parFournisseur.get(contrat.fournisseurId) ?? null,
        consommation: total,
        pct: cible > 0 ? Math.round((total / cible) * 100) : 0,
      }
    })
  )
}

export async function chargerContratDetail(id: string): Promise<ContratDetail> {
  const snap = await getDoc(doc(db, COLLECTIONS.contrats, id))
  if (!snap.exists()) throw new Error(`Contrat ${id} introuvable`)
  const contrat = snap.data() as ContratDoc

  const [fournisseur, projets, avc] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.fournisseurs, contrat.fournisseurId)),
    Promise.all(contrat.projetIds.map((pid) => getDoc(doc(db, COLLECTIONS.projets, pid)))),
    chargerAvc(id),
  ])

  const conso = await consommation(id, contrat)

  return {
    id: snap.id,
    ...contrat,
    avc,
    fournisseur: fournisseur.exists() ? { nom: (fournisseur.data() as FournisseurDoc).nom } : null,
    projets: projets.filter((p) => p.exists()).map((p) => ({ id: p.id, nom: p.data()?.nom as string })),
    consommation: conso,
  }
}

export interface Fournisseur {
  id: string
  nom: string
}

export async function chargerFournisseurs(): Promise<Fournisseur[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.fournisseurs))
  return snap.docs
    .map((d) => ({ id: d.id, nom: (d.data() as FournisseurDoc).nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom))
}
