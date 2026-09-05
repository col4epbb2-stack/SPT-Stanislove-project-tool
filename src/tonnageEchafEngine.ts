import type {
  LigneJournalTonnage,
  LignePersonnelTonnage,
  ObjectifJournalierChamp,
  PersonnelAnnexe,
  TonnageContrat,
} from '../types/tonnageEchaf'

// Moteur de calcul du classeur « SUIVI TONNAGE ECHAFAUDAGES » : réplique les
// colonnes calculées de la feuille Journal (poids contractuel, écarts de
// démontage, savings, durées, retard et perte estimée) ainsi que le suivi de
// tonnage en cours par champ (feuille SUIVI TONNAGE_ECHAF), recalculés en
// direct à partir des lignes de détail. Le retard/la perte dépendent de la
// date du jour (TODAY() dans le classeur d'origine) : ils sont donc toujours
// recalculés à l'affichage, jamais figés dans les données.

const MS_PAR_JOUR = 86_400_000

function jours(date1: string | null, date2: string | null): number | null {
  if (!date1 || !date2) return null
  return Math.round((new Date(date2).getTime() - new Date(date1).getTime()) / MS_PAR_JOUR)
}

export function statutNormalise(l: LigneJournalTonnage): string {
  return (l.statut ?? '').trim()
}

export function m3Reel(l: LigneJournalTonnage): number | null {
  if (l.m3Reel != null) return l.m3Reel
  if (l.longueurReelle == null || l.largeurReelle == null || l.hauteurReelle == null) return null
  return l.longueurReelle * l.largeurReelle * l.hauteurReelle
}

// M3 réel × densité contractuelle (kg/m3) / 1000 = poids contractuel (T).
export function poidsContractuel(l: LigneJournalTonnage, contrat: TonnageContrat): number | null {
  const m3 = m3Reel(l)
  return m3 != null ? (m3 * contrat.densiteKgParM3) / 1000 : null
}

/**
 * « Lorsqu'une modification est déclarée : le système doit considérer que la
 * production du jour correspond au poids de la modification réalisée = poids
 * contractuel » (§F, TON1-41, 03/09/2026, lot 5).
 *
 * Résolution de Q11 : le document décrit « Jour 1 montage initial · Jour 2
 * demande de modification » comme **deux demandes distinctes** — une
 * modification est donc sa propre ligne de journal, avec ses propres cotes,
 * et non une mise à jour de la ligne d'origine. Ses cotes décrivent la
 * modification seule, l'égalité avec le poids contractuel de la ligne est
 * donc immédiate — pas de delta à calculer contre une ligne antérieure.
 *
 * Rend `null` pour toute ligne qui n'est pas une modification : le module
 * n'a **aucune** notion générale de « production du jour » ailleurs (seule la
 * feuille figée SUIVI TONNAGE_ECHAF en porte une, importée telle quelle) —
 * inventer une valeur ici ferait croire à un calcul qui n'existe pas.
 */
export function productionDuJourTonnage(l: LigneJournalTonnage, contrat: TonnageContrat): number | null {
  return l.modification === 'OUI' ? poidsContractuel(l, contrat) : null
}

// Écart entre notification de dépose et dépose réelle (jours).
export function ecartDemontage(l: LigneJournalTonnage): number | null {
  return jours(l.dateNotificationDepose, l.dateDeposeReel)
}

export function savingDemontageTonne(l: LigneJournalTonnage, contrat: TonnageContrat): number | null {
  const ecart = ecartDemontage(l)
  const pc = poidsContractuel(l, contrat)
  return ecart != null && pc != null ? ecart * pc : null
}

export function savingDemontageCout(l: LigneJournalTonnage, contrat: TonnageContrat): number | null {
  const saving = savingDemontageTonne(l, contrat)
  return saving != null && contrat.coutTonne != null ? contrat.coutTonne * saving : null
}

// Saving lié à la mutualisation Part fixe / Part variable (plancher 10 T).
export function savingMutualisation(l: LigneJournalTonnage, contrat: TonnageContrat): number {
  if (!l.date || l.date <= contrat.dateDebutMutualisation) return 0
  if ((l.modeFacturation ?? '').trim().toLowerCase() !== 'part fixe') return 0
  const pc = poidsContractuel(l, contrat)
  if (pc == null) return 0
  return contrat.seuilMutualisationT - pc
}

export function dureeProjetPrevisionnelle(l: LigneJournalTonnage): number {
  const d = jours(l.dateMontagePrev, l.dateDeposePrev)
  return d != null ? d + 1 : 0
}

export function dureeProjetReelle(l: LigneJournalTonnage): number {
  if (statutNormalise(l) === 'En attente') return 0
  if (!l.dateMontageReel && !l.dateDeposeReel) return 0
  if (!l.dateDeposeReel) return jours(l.dateMontageReel, l.dateDeposePrev) ?? 0
  const d = jours(l.dateMontageReel, l.dateDeposeReel)
  return d != null ? d + 1 : 0
}

export function retardEcart(l: LigneJournalTonnage): number {
  if (statutNormalise(l) === 'En attente') return 0
  return dureeProjetReelle(l) - dureeProjetPrevisionnelle(l)
}

// TODAY() − date de dépose prévisionnelle : positif si toujours monté après l'échéance.
export function retardADate(l: LigneJournalTonnage, aujourdhui: Date = new Date()): number | null {
  if (!l.dateDeposePrev) return null
  return Math.round((aujourdhui.getTime() - new Date(l.dateDeposePrev).getTime()) / MS_PAR_JOUR)
}

export function perteXaf(l: LigneJournalTonnage, contrat: TonnageContrat, aujourdhui: Date = new Date()): number | null {
  const retard = retardADate(l, aujourdhui)
  const pc = poidsContractuel(l, contrat)
  if (retard == null || pc == null || contrat.coutTonne == null) return null
  return retard * contrat.coutTonne * pc
}

export function perteEnTonnes(l: LigneJournalTonnage, contrat: TonnageContrat, aujourdhui: Date = new Date()): number | null {
  const retard = retardADate(l, aujourdhui)
  const pc = poidsContractuel(l, contrat)
  if (retard == null || pc == null) return null
  return retard * pc
}

export function gap2(l: LigneJournalTonnage, contrat: TonnageContrat): number | null {
  const pc = poidsContractuel(l, contrat)
  return l.poidsT != null && pc != null ? l.poidsT - pc : null
}

// Colonne "Filtre démontage" : état de la commande selon les dates renseignées.
export function filtreDemontage(l: LigneJournalTonnage): string {
  if (l.dateNotificationDepose) return 'Commande notifiée'
  if (l.dateDeposeReel) return 'Commandes démontées'
  return 'Commandes montées'
}

// Colonne "Tonnage part variable" : poids contractuel hors Core crew.
export function tonnagePartVariable(l: LigneJournalTonnage, contrat: TonnageContrat): number | null {
  if ((l.modeFacturation ?? '').trim().toLowerCase() === 'core crew') return 0
  return poidsContractuel(l, contrat)
}

// Colonne "Filtre Perte" : NOK si la perte en tonnes est négative.
export function filtrePerte(l: LigneJournalTonnage, contrat: TonnageContrat, aujourdhui: Date = new Date()): string | null {
  const perte = perteEnTonnes(l, contrat, aujourdhui)
  if (perte == null) return null
  return perte < 0 ? 'NOK' : 'OK'
}

// Colonne "Semaine" : WEEKNUM Excel (semaines démarrant le dimanche,
// la semaine 1 contient le 1er janvier).
export function semaineDeLigne(l: LigneJournalTonnage): number | null {
  if (!l.date) return null
  const d = new Date(l.date)
  const premierJanvier = new Date(d.getFullYear(), 0, 1)
  const jourAnnee = Math.round((d.getTime() - premierJanvier.getTime()) / MS_PAR_JOUR) + 1
  return Math.ceil((jourAnnee + premierJanvier.getDay()) / 7)
}

export interface RepartitionChamp {
  champ: string
  nombre: number
  poidsContractuelTotal: number
  monte: number
  demonte: number
  enAttente: number
}

// Répartition par champ (AGM/IM/TRM) : nombre d'affaires, tonnage, statuts.
export function repartitionParChamp(journal: LigneJournalTonnage[], contrat: TonnageContrat): RepartitionChamp[] {
  const acc = new Map<string, RepartitionChamp>()
  for (const l of journal) {
    const champ = l.champs ?? '—'
    const e = acc.get(champ) ?? { champ, nombre: 0, poidsContractuelTotal: 0, monte: 0, demonte: 0, enAttente: 0 }
    e.nombre += 1
    e.poidsContractuelTotal += poidsContractuel(l, contrat) ?? 0
    const statut = statutNormalise(l)
    if (statut === 'En attente') e.enAttente += 1
    else if (l.dateDeposeReel) e.demonte += 1
    else e.monte += 1
    acc.set(champ, e)
  }
  return [...acc.values()].sort((a, b) => b.poidsContractuelTotal - a.poidsContractuelTotal)
}

export interface RetardParChamp {
  champ: string
  cumulRetardJours: number
  cumulPerteXaf: number
  cumulPerteTonnes: number
  nombreEnRetard: number
}

// Cumul du retard et de la perte estimée (à date) pour les échafaudages encore montés.
export function retardParChamp(
  journal: LigneJournalTonnage[],
  contrat: TonnageContrat,
  aujourdhui: Date = new Date()
): RetardParChamp[] {
  const acc = new Map<string, RetardParChamp>()
  for (const l of journal) {
    if (l.dateDeposeReel || statutNormalise(l) === 'En attente') continue
    const retard = retardADate(l, aujourdhui)
    if (retard == null || retard <= 0) continue
    const champ = l.champs ?? '—'
    const e = acc.get(champ) ?? { champ, cumulRetardJours: 0, cumulPerteXaf: 0, cumulPerteTonnes: 0, nombreEnRetard: 0 }
    e.cumulRetardJours += retard
    e.cumulPerteXaf += perteXaf(l, contrat, aujourdhui) ?? 0
    e.cumulPerteTonnes += perteEnTonnes(l, contrat, aujourdhui) ?? 0
    e.nombreEnRetard += 1
    acc.set(champ, e)
  }
  return [...acc.values()].sort((a, b) => b.cumulPerteXaf - a.cumulPerteXaf)
}

export interface TonnageEnCours {
  champ: string
  modeFacturation: string
  tonnage: number
}

// Tonnage contractuel actuellement en service (monté à la date `asOf`, pas
// encore déposé), par champ et mode de facturation.
export function tonnageEnCours(
  journal: LigneJournalTonnage[],
  contrat: TonnageContrat,
  asOf: string = new Date().toISOString().slice(0, 10)
): TonnageEnCours[] {
  const acc = new Map<string, number>()
  for (const l of journal) {
    const monte = l.dateMontageReel ?? l.dateMontagePrev
    if (!monte || monte > asOf) continue
    if (l.dateDeposeReel && l.dateDeposeReel <= asOf) continue
    const champ = l.champs ?? '—'
    const mode = (l.modeFacturation ?? '—').trim()
    const key = `${champ}|${mode}`
    acc.set(key, (acc.get(key) ?? 0) + (poidsContractuel(l, contrat) ?? 0))
  }
  return [...acc.entries()].map(([key, tonnage]) => {
    const [champ, modeFacturation] = key.split('|')
    return { champ, modeFacturation, tonnage }
  })
}

export interface PointCourbeTonnage {
  date: string
  montageJournalierCoreCrew: number
  montageJournalierHorsCoreCrew: number
  cumulCoreCrew: number
  cumulHorsCoreCrew: number
  cibleTheorique: number | null
}

// Courbe de tonnage monté cumulé (Core crew vs hors Core crew) par champ,
// recalculée en direct depuis les dates de montage réelles du Journal, sur
// la période couverte par les lignes disponibles — comparée à la cible
// théorique journalière (feuille Prod, table "objectif de production/cible").
export function courbeMontageCumulee(
  journal: LigneJournalTonnage[],
  contrat: TonnageContrat,
  objectifJournalier: ObjectifJournalierChamp[],
  champ: string
): PointCourbeTonnage[] {
  const lignesChamp = journal.filter((l) => l.champs === champ && l.dateMontageReel)
  const dates = [...new Set(lignesChamp.map((l) => l.dateMontageReel as string))].sort()
  const cibleParDate = new Map(
    objectifJournalier.filter((o) => o.champ === champ).map((o) => [o.date, o.objectifProductionT])
  )

  let cumulCore = 0
  let cumulHors = 0
  return dates.map((date) => {
    let jourCore = 0
    let jourHors = 0
    for (const l of lignesChamp) {
      if (l.dateMontageReel !== date) continue
      const pc = poidsContractuel(l, contrat) ?? 0
      if ((l.modeFacturation ?? '').trim().toLowerCase() === 'core crew') jourCore += pc
      else jourHors += pc
    }
    cumulCore += jourCore
    cumulHors += jourHors
    return {
      date,
      montageJournalierCoreCrew: jourCore,
      montageJournalierHorsCoreCrew: jourHors,
      cumulCoreCrew: cumulCore,
      cumulHorsCoreCrew: cumulHors,
      cibleTheorique: cibleParDate.get(date) ?? null,
    }
  })
}

// --- Mutualisation dérivée (lot 6, 03/09/2026, §H/§I de
// `doc/Suivi tonnage rev01.docx`, TON1-49→51 — résout la partie qui restait
// figée) --------------------------------------------------------------------
//
// « Jour 1 : consommation de 3 tonnes ; Forfait disponible : 5 tonnes ;
// Solde disponible du jour 1 : 2 tonnes. Jour 2 : consommation de 7 tonnes
// => Dépassement : 2 tonnes. […] les 2 tonnes non consommées du Jour 1
// viennent compenser les 2 tonnes supplémentaires du Jour 2. »
//
// C'est un solde qui court d'un jour sur l'autre — pas une remise à zéro
// quotidienne. `depassementBrut` est le nombre littéralement nommé
// « Dépassement » dans l'exemple (avant compensation) ; `facturableHorsForfait`
// est ce qui reste dû une fois le solde des jours précédents consommé — 0
// dans l'exemple, puisque les 2 tonnes de solde couvrent exactement les 2
// tonnes de dépassement.
//
// Le forfait ne couvre que le tonnage facturé en Core crew — c'est déjà la
// règle de la colonne figée « Saving mutualisation » (5 − cumul Core crew,
// vérifiée sans écart) : le tonnage Part Variable est une facturation à part,
// « toute ressource supplémentaire mobilisée en renfort de la Core Crew doit
// être identifiée et facturée en Part Variable » (TON1-48) — il ne consomme
// pas le même forfait.
export interface JourMutualisation {
  date: string
  /** Tonnage Core crew consommé ce jour-là (poids contractuel). */
  consomme: number
  /** Part de la consommation du jour couverte par le forfait. */
  forfaitInclus: number
  /** « Dépassement » au sens de l'exemple — avant compensation par le solde des jours précédents. */
  depassementBrut: number
  /** Économie du jour, avant tout usage ultérieur — même valeur que la colonne figée « Saving mutualisation ». */
  economieDuJour: number
  /** Solde cumulé disponible avant ce jour (les économies des jours précédents, non encore consommées). */
  soldeCumuleAvant: number
  /** Part du solde disponible effectivement utilisée pour compenser le dépassement du jour. */
  compensation: number
  /** Ce qui reste dû après compensation — la « quantité réellement facturable hors forfait ». */
  facturableHorsForfait: number
  /** Solde cumulé disponible après ce jour, reporté sur le suivant. */
  soldeCumuleApres: number
}

/**
 * Suivi quotidien de la mutualisation du forfait matériel, pour un champ.
 * Dérivé du Journal (dates de montage réelles, comme `courbeMontageCumulee`)
 * — pas de la feuille SUIVI TONNAGE_ECHAF, figée à la situation de juin 2026.
 *
 * `forfait` vient de `ParametresContratTonnage.champs[].forfaitMaterielTonnesJour`
 * (Paramètres › Tonnage échafaudage, réglé au lot 1) : sans lui, la
 * mutualisation n'a pas de référence, l'appelant ne doit pas invoquer cette
 * fonction pour un champ dont le forfait est inconnu.
 */
export function mutualisationParChamp(
  journal: LigneJournalTonnage[],
  contrat: TonnageContrat,
  forfait: number,
  champ: string
): JourMutualisation[] {
  const lignesChamp = journal.filter((l) => l.champs === champ && l.dateMontageReel)
  const dates = [...new Set(lignesChamp.map((l) => l.dateMontageReel as string))].sort()

  let solde = 0
  return dates.map((date) => {
    const consomme = lignesChamp
      .filter(
        (l) => l.dateMontageReel === date && (l.modeFacturation ?? '').trim().toLowerCase() === 'core crew'
      )
      .reduce((s, l) => s + (poidsContractuel(l, contrat) ?? 0), 0)
    const forfaitInclus = Math.min(consomme, forfait)
    const depassementBrut = Math.max(0, consomme - forfait)
    const economieDuJour = Math.max(0, forfait - consomme)
    const soldeCumuleAvant = solde
    const compensation = Math.min(depassementBrut, Math.max(0, soldeCumuleAvant))
    const facturableHorsForfait = depassementBrut - compensation
    solde = soldeCumuleAvant + economieDuJour - compensation
    return {
      date,
      consomme,
      forfaitInclus,
      depassementBrut,
      economieDuJour,
      soldeCumuleAvant,
      compensation,
      facturableHorsForfait,
      soldeCumuleApres: solde,
    }
  })
}

// --- Courbe de cartographie (lot 6, TON1-58) --------------------------------
//
// « Il manque la courbe de la cartographie (le tonnage cumulé/plateformes).
// Cette courbe permet de savoir combien de tonnes on a dans X ou Y
// plateforme. »
//
// Le graphique du classeur (`chart1.xml`, reproduit figé dans l'onglet SUIVI
// TONNAGE_ECHAF) porte des valeurs et une plateforme (`TRM-TOR`) qui ne se
// retrouvent dans aucun des 7 graphiques du classeur transmis — vérifié
// directement dans le fichier .xlsm. La capture du document (`image5.png`)
// est donc soit une autre période (l'historique 2024-2025, 34 508 lignes de
// plus que ce que le navigateur peut charger), soit un autre extrait ; ce
// n'est de toute façon pas une valeur figée qu'on peut recopier. Cette
// fonction dérive le cumul directement des lignes chargées (exercice 2026) :
// `site` **est** la plateforme du Journal (36 valeurs distinctes).
export interface TonnageParSite {
  site: string
  tonnage: number
}

export function tonnageCumuleParSite(journal: LigneJournalTonnage[], contrat: TonnageContrat): TonnageParSite[] {
  const parSite = new Map<string, number>()
  for (const l of journal) {
    if (!l.site) continue
    const pc = poidsContractuel(l, contrat) ?? 0
    parSite.set(l.site, (parSite.get(l.site) ?? 0) + pc)
  }
  return [...parSite.entries()]
    .map(([site, tonnage]) => ({ site, tonnage }))
    .sort((a, b) => b.tonnage - a.tonnage)
}

export const MOIS_COURTS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

export function anneeDeLigne(l: LigneJournalTonnage): number | null {
  return l.date ? Number(l.date.slice(0, 4)) : null
}

export function moisDeLigne(l: LigneJournalTonnage): string | null {
  if (!l.date) return null
  const m = Number(l.date.slice(5, 7))
  return Number.isInteger(m) && m >= 1 && m <= 12 ? MOIS_COURTS[m - 1] : null
}

// --- Feuille "Suivi personnel" : colonnes calculées ------------------------
//
// Ajouté le 06/08/2026 en même temps que le formulaire de saisie du Suivi
// personnel : jusqu'ici l'onglet n'affichait que des lignes importées, dont
// ces 4 colonnes venaient telles quelles du classeur. Elles sont en réalité
// des formules — vérifié sur la totalité des 3 384 lignes réelles du
// classeur (src/data/tonnageEchaf/personnel.json), 0 écart sur les 4 :
//   NPT                    = standby / nombre d'heures
//   part temps productif   = 1 − NPT
//   objectif prod. (T)     = productivité × objectif kg/h du champ ×
//                            heures/jour du champ / 1000
//   objectif prod. (kg)    = objectif prod. (T) × 1000 / heures/jour du champ
// (les heures/jour et l'objectif kg/h par champ viennent des annexes de la
// même feuille, PersonnelAnnexe.heuresProductivite.)
//
// La saisie ne porte donc que sur les colonnes réellement manuelles ; ces
// 4 colonnes-ci sont dérivées à l'enregistrement, comme toutes les colonnes
// calculées du projet (doc/suivi tonnage.docx : "les autres colonnes ne sont
// rien d'autres que des colonnes avec des formules").
export interface PersonnelTonnageDerive {
  objectifProductionT: number | null
  objectifProductionKg: number | null
  partTempsProductif: number | null
  npt: number | null
}

export function derivePersonnelTonnage(
  saisie: Pick<LignePersonnelTonnage, 'champs' | 'productivite' | 'nombreHeures' | 'standby'>,
  annexe: PersonnelAnnexe
): PersonnelTonnageDerive {
  const parametres = annexe.heuresProductivite.find((h) => h.champ === saisie.champs) ?? null
  const heuresParJour = parametres?.heuresParJour ?? null
  const objectifKgParHeure = parametres?.objectifKgParHeure ?? null

  const npt =
    saisie.nombreHeures && saisie.nombreHeures > 0 ? (saisie.standby ?? 0) / saisie.nombreHeures : null

  const objectifProductionT =
    saisie.productivite != null && objectifKgParHeure != null && heuresParJour != null
      ? (saisie.productivite * objectifKgParHeure * heuresParJour) / 1000
      : null

  return {
    objectifProductionT,
    objectifProductionKg:
      objectifProductionT != null && heuresParJour ? (objectifProductionT * 1000) / heuresParJour : null,
    partTempsProductif: npt == null ? null : 1 - npt,
    npt,
  }
}

// Productivité déjà utilisée pour un profil dans les lignes existantes
// (Chef d'Equipe 0,5 · Monteur 1 dans les données réelles) — proposée comme
// valeur de départ à la saisie plutôt que codée en dur : un profil inconnu
// du classeur n'a pas de coefficient inventé, l'utilisateur le saisit.
export function productiviteHabituelle(profil: string, lignes: LignePersonnelTonnage[]): number | null {
  const ligne = lignes.find((l) => l.profil === profil && l.productivite != null)
  return ligne?.productivite ?? null
}
