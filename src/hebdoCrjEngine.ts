import type {
  AvancementProjetHebdo,
  DefautPlanningLigne,
  LigneJournalHebdo,
  MaterielSiteLigne,
  PersonnelMobiliseLigne,
} from '../types/hebdoCrj'

// Moteur de calcul du classeur « SUIVI HEBDO_CRJ ICP » : réplique les colonnes
// calculées de la feuille Journal (Durée, Avancement prévisionnel, Heure
// productivité réelle) et les pivots des feuilles CRJ/Paramètres (effectif et
// causes de dérive par société, avancement moyen par service, récapitulatif
// HSE, cumul de dérive planning par cause), recalculés en direct à partir des
// lignes de détail plutôt que depuis des caches de pivot Excel.

const DESCRIPTIONS_SANS_AVANCEMENT = new Set(['personnel', 'matériel', 'materiel'])

export function dureeJournal(l: LigneJournalHebdo): number | null {
  if (!l.dateDebut || !l.dateFin) return null
  const debut = new Date(l.dateDebut).getTime()
  const fin = new Date(l.dateFin).getTime()
  return Math.round((fin - debut) / 86_400_000) + 1
}

export function heureProductiviteReelle(l: LigneJournalHebdo): number | null {
  if ((l.description ?? '').trim().toLowerCase() === 'personnel') return null
  if (l.heureProductiviteContractuelle == null || l.dureeStandBy == null) return null
  return l.heureProductiviteContractuelle - l.dureeStandBy
}

export function avancementPrevisionnel(l: LigneJournalHebdo, parProjet: AvancementProjetHebdo[]): number | null {
  if (DESCRIPTIONS_SANS_AVANCEMENT.has((l.description ?? '').trim().toLowerCase())) return null
  const p = parProjet.find((x) => x.projet === (l.nomProjet ?? '').trim())
  return p?.avancementJournalier ?? null
}

export function moisDeLigne(l: LigneJournalHebdo): string {
  return new Date(l.date).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
}

export interface EffectifSociete {
  societe: string
  effectif: number
  heureProductiviteReelle: number
  dureeStandByCumulee: number
  frc: number
  exp: number
  log: number
  meteo: number
  ctr2: number
  icp: number
  otto2: number
}

// Pivot « Paramètres »/CRJ : effectif et causes de dérive par société/CTR.
export function effectifParSociete(journal: LigneJournalHebdo[]): EffectifSociete[] {
  const acc = new Map<string, EffectifSociete>()
  for (const l of journal) {
    const societe = l.societeCtr ?? '—'
    const e = acc.get(societe) ?? {
      societe,
      effectif: 0,
      heureProductiviteReelle: 0,
      dureeStandByCumulee: 0,
      frc: 0,
      exp: 0,
      log: 0,
      meteo: 0,
      ctr2: 0,
      icp: 0,
      otto2: 0,
    }
    e.effectif += l.qte ?? 0
    e.heureProductiviteReelle += heureProductiviteReelle(l) ?? 0
    e.dureeStandByCumulee += l.dureeStandBy ?? 0
    e.frc += l.frc ?? 0
    e.exp += l.exp ?? 0
    e.log += l.log ?? 0
    e.meteo += l.meteo ?? 0
    e.ctr2 += l.ctr2 ?? 0
    e.icp += l.icp ?? 0
    e.otto2 += l.otto2 ?? 0
    acc.set(societe, e)
  }
  return [...acc.values()].sort((a, b) => b.effectif - a.effectif)
}

export interface AvancementService {
  service: string
  avancementPrevisionnelMoyen: number | null
  avancementReelMoyen: number | null
  nombreLignes: number
}

// Pivot CRJ « SERVICES » : avancement moyen prévisionnel/réel par service.
export function avancementParService(journal: LigneJournalHebdo[], parProjet: AvancementProjetHebdo[]): AvancementService[] {
  const acc = new Map<string, { sommePrev: number; nPrev: number; sommeReel: number; nReel: number; total: number }>()
  for (const l of journal) {
    const service = l.servicesTeepg ?? '—'
    const e = acc.get(service) ?? { sommePrev: 0, nPrev: 0, sommeReel: 0, nReel: 0, total: 0 }
    e.total += 1
    const prev = avancementPrevisionnel(l, parProjet)
    if (typeof prev === 'number') {
      e.sommePrev += prev
      e.nPrev += 1
    }
    if (typeof l.avancementReel === 'number') {
      e.sommeReel += l.avancementReel
      e.nReel += 1
    }
    acc.set(service, e)
  }
  return [...acc.entries()].map(([service, e]) => ({
    service,
    avancementPrevisionnelMoyen: e.nPrev ? e.sommePrev / e.nPrev : null,
    avancementReelMoyen: e.nReel ? e.sommeReel / e.nReel : null,
    nombreLignes: e.total,
  }))
}

export interface HseRecap {
  accidentFat: number
  accidentLti: number
  nearMissHpi: number
  premierSoins: number
  anomalie: number
  causerieSecurite: number
}

// Récapitulatif HSE cumulé sur la période du journal.
export function hseRecap(journal: LigneJournalHebdo[]): HseRecap {
  return journal.reduce(
    (acc, l) => ({
      accidentFat: acc.accidentFat + (l.accidentFat ?? 0),
      accidentLti: acc.accidentLti + (l.accidentLti ?? 0),
      nearMissHpi: acc.nearMissHpi + (l.nearMissHpi ?? 0),
      premierSoins: acc.premierSoins + (l.premierSoins ?? 0),
      anomalie: acc.anomalie + (l.anomalie ?? 0),
      causerieSecurite: acc.causerieSecurite + (l.causerieSecurite ?? 0),
    }),
    { accidentFat: 0, accidentLti: 0, nearMissHpi: 0, premierSoins: 0, anomalie: 0, causerieSecurite: 0 }
  )
}

export interface IndicateursHSEDerives {
  heuresTravaillees: number
  fat: number
  lti: number
  hpi: number
  fac: number
  anomalies: number
}

// HSE dérivé du CRJ (Logique_metier_liaisons_ICP.docx §3.3, Phase 3), aligné
// sur les compteurs du classeur de référence HSE (FAT/LTI/HPI/FAC/Anomalies,
// cf. types/hse.ts) : heures travaillées = somme des heures de productivité
// réelle. CHSE, MTC et Audits HSE n'ont pas d'équivalent dans le journal
// (compteurs d'événements, pas ces catégories précises) — restent à 0/saisie
// manuelle uniquement (cf. HSETab).
export function deriveIndicateursHSE(journal: LigneJournalHebdo[]): IndicateursHSEDerives {
  const recap = hseRecap(journal)
  const heuresTravaillees = journal.reduce((s, l) => s + (heureProductiviteReelle(l) ?? 0), 0)
  return {
    heuresTravaillees,
    fat: recap.accidentFat,
    lti: recap.accidentLti,
    hpi: recap.nearMissHpi,
    fac: recap.premierSoins,
    anomalies: recap.anomalie,
  }
}

// Avancement "Travaux site" d'un projet dérivé du CRJ (doc §3.3) : dernier
// avancementReel connu sur les lignes déjà résolues à ce projet (la
// résolution elle-même — quelles lignes appartiennent au projet — est une
// étape séparée, cf. useResolveur()).
export function dernierAvancementReel(lignesProjet: LigneJournalHebdo[]): number | null {
  const avecAvancement = lignesProjet.filter((l): l is LigneJournalHebdo & { avancementReel: number } => typeof l.avancementReel === 'number')
  if (avecAvancement.length === 0) return null
  return [...avecAvancement].sort((a, b) => b.date.localeCompare(a.date))[0].avancementReel
}

export interface CauseDerivePlanning {
  cause: string
  heuresCumulees: number
}

// Feuille « Défaut Planning » : cumul des heures de dérive par cause.
export function causesDerivePlanning(lignes: DefautPlanningLigne[]): CauseDerivePlanning[] {
  const acc = new Map<string, number>()
  for (const l of lignes) {
    const cause = l.cause ?? '—'
    acc.set(cause, (acc.get(cause) ?? 0) + (l.totalHeureStbPax ?? 0))
  }
  return [...acc.entries()].map(([cause, heuresCumulees]) => ({ cause, heuresCumulees })).sort((a, b) => b.heuresCumulees - a.heuresCumulees)
}

// --- Vue "Rapport journalier" (instantané d'une date) ---------------------

// « Core crew » (colonne Oui/Non du rapport) dérivé de la taxonomie Part
// Fixe/Part variable/Hors Core crew déjà saisie sur la ligne Journal.
export function estCoreCrew(l: LigneJournalHebdo): boolean | null {
  if (!l.coreCrewPartVariable) return null
  return l.coreCrewPartVariable !== 'Personnel hors Core crew'
}

export function affairesDuJour(journal: LigneJournalHebdo[], date: string): LigneJournalHebdo[] {
  return journal.filter((l) => l.date === date)
}

export function veilleDe(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface AvancementServiceJour {
  veilleMoyen: number | null
  jourMoyen: number | null
}

// Avancement général d'un service pour une journée : moyenne des % J-1/J des
// affaires actives ce jour-là (équivalent de la ligne "% général" du rapport).
export function avancementServiceJour(lignes: LigneJournalHebdo[]): AvancementServiceJour {
  const veilles = lignes.map((l) => l.avancementVeille).filter((v): v is number => typeof v === 'number')
  const jours = lignes.map((l) => l.avancementReel).filter((v): v is number => typeof v === 'number')
  return {
    veilleMoyen: veilles.length ? veilles.reduce((s, v) => s + v, 0) / veilles.length : null,
    jourMoyen: jours.length ? jours.reduce((s, v) => s + v, 0) / jours.length : null,
  }
}

export interface MaterielPivot {
  materiels: string[]
  lignes: { societe: string; quantites: Record<string, number> }[]
}

// « SUIVI MATERIEL SUR SITE » : reconstitue la grille société × type de
// matériel affichée dans le classeur à partir des lignes détail.
export function pivotMateriel(lignes: MaterielSiteLigne[]): MaterielPivot {
  const materiels = [...new Set(lignes.map((l) => l.materiel))]
  const parSociete = new Map<string, Record<string, number>>()
  for (const l of lignes) {
    const quantites = parSociete.get(l.societe) ?? {}
    quantites[l.materiel] = (quantites[l.materiel] ?? 0) + l.quantite
    parSociete.set(l.societe, quantites)
  }
  return { materiels, lignes: [...parSociete.entries()].map(([societe, quantites]) => ({ societe, quantites })) }
}

// --- Coût du standby / NPT ---------------------------------------------
//
// Bloqué jusqu'ici (cf. CLAUDE.md) faute de grille tarifaire CRJ importée
// (aucune collection `hebdo-crj__tarifs` n'existe encore, contrairement au
// TABLEAU_REGIE de Facturation au point ou au référentiel Contrat peinture).
// Cette section fournit uniquement la logique de calcul, paramétrée par une
// `GrilleTarifsNpt` fournie par l'appelant — PAS de tarifs fictifs codés en
// dur ici, pour ne jamais risquer d'être pris pour une vraie grille
// contractuelle. Tant qu'une grille réelle n'est pas importée, ces fonctions
// ne sont appelables qu'avec une grille de test construite par l'appelant.

export interface GrilleTarifsNpt {
  // Nombre d'heures d'une journée pleine, pour convertir un tarif journalier
  // en tarif horaire (même convention que TABLEAU_REGIE dans
  // facturationPointEngine.ts, qui divise le tarif jour par 12 — ici
  // paramétrable puisqu'aucune référence CRJ équivalente n'est confirmée).
  heuresJourReference: number
  tarifJournalierParProfil: Record<string, number>
  tarifJournalierParMateriel: Record<string, number>
}

export interface CoutStandbyProfil {
  profil: string
  heuresStandBy: number
  cout: number
}

// Coût du standby (NPT) du personnel mobilisé : Σ par profil de (durée
// standby en heures × tarif journalier du profil / heuresJourReference).
// `PersonnelMobiliseLigne.dureeStandBy` porte déjà les heures de standby par
// société/profil/date (feuille "SUIVI DU PERSONNEL").
export function coutStandbyPersonnel(
  lignes: PersonnelMobiliseLigne[],
  grille: GrilleTarifsNpt
): { parProfil: CoutStandbyProfil[]; total: number } {
  const heuresParProfil = new Map<string, number>()
  for (const l of lignes) {
    if (!l.dureeStandBy) continue
    heuresParProfil.set(l.profil, (heuresParProfil.get(l.profil) ?? 0) + l.dureeStandBy)
  }
  const parProfil = [...heuresParProfil.entries()]
    .map(([profil, heuresStandBy]) => {
      const tarifJournalier = grille.tarifJournalierParProfil[profil] ?? 0
      return { profil, heuresStandBy, cout: heuresStandBy * (tarifJournalier / grille.heuresJourReference) }
    })
    .sort((a, b) => b.cout - a.cout)
  return { parProfil, total: parProfil.reduce((s, p) => s + p.cout, 0) }
}

export interface CoutStandbyMateriel {
  materiel: string
  joursMobilises: number
  coutEstime: number
  /**
   * `true` quand le coût vient des **heures d'utilisation réellement
   * saisies** (rev04 §3), `false` quand il vient de l'approximation par le
   * taux de standby du personnel. Un écran qui mélange les deux sans le dire
   * ferait passer une estimation pour une mesure.
   */
  mesure: boolean
}

// Coût du standby (NPT) du matériel mobilisé.
//
// **Deux régimes, et l'écran doit savoir lequel il affiche.**
//
// 1. `heuresUtilisation` renseignée (31/08/2026, `commentaires CRJ_rev04.docx`
//    §3) : l'inactivité de la ligne est la part de la journée pendant laquelle
//    le matériel n'a **pas** servi — `1 − heures / heuresJourReference`,
//    bornée à [0, 1]. C'est une mesure, plus une estimation, et c'est ce que
//    le document vient précisément débloquer en demandant ce champ.
// 2. `heuresUtilisation` absente — les lignes importées du classeur et toutes
//    celles saisies avant ce jour : on retombe sur l'approximation d'origine,
//    le taux de standby observé sur le **personnel** de la même date
//    (Σ dureeStandBy / (effectif du jour × heuresJourReference)). La feuille
//    "SUIVI MATERIEL SUR SITE" ne porte aucune durée propre, il n'y a rien
//    d'autre à quoi se raccrocher.
//
// Une absence n'est jamais lue comme « 0 heure d'utilisation », qui
// signifierait « matériel inactif toute la journée » et gonflerait le coût de
// tout l'historique d'un coup.
export function coutStandbyMateriel(
  materielLignes: MaterielSiteLigne[],
  personnelLignes: PersonnelMobiliseLigne[],
  grille: GrilleTarifsNpt
): { parMateriel: CoutStandbyMateriel[]; total: number } {
  const effectifParDate = new Map<string, number>()
  const standbyParDate = new Map<string, number>()
  for (const l of personnelLignes) {
    effectifParDate.set(l.date, (effectifParDate.get(l.date) ?? 0) + l.quantite)
    standbyParDate.set(l.date, (standbyParDate.get(l.date) ?? 0) + (l.dureeStandBy ?? 0))
  }
  const tauxStandByParDate = new Map<string, number>()
  for (const [date, effectif] of effectifParDate) {
    const heuresDisponibles = effectif * grille.heuresJourReference
    tauxStandByParDate.set(date, heuresDisponibles > 0 ? Math.min(1, (standbyParDate.get(date) ?? 0) / heuresDisponibles) : 0)
  }

  const acc = new Map<string, { joursMobilises: number; coutEstime: number; mesurees: number }>()
  for (const l of materielLignes) {
    // Heures saisies : la part inutilisée de la journée est connue.
    // Absentes : on retombe sur le taux de standby du personnel du jour.
    const heures = l.heuresUtilisation
    const mesuree = heures !== null && heures !== undefined
    const taux = mesuree
      ? Math.min(1, Math.max(0, 1 - heures / grille.heuresJourReference))
      : (tauxStandByParDate.get(l.date) ?? 0)
    if (taux === 0) continue
    const tarifJournalier = grille.tarifJournalierParMateriel[l.materiel] ?? 0
    const e = acc.get(l.materiel) ?? { joursMobilises: 0, coutEstime: 0, mesurees: 0 }
    e.joursMobilises += l.quantite
    e.coutEstime += l.quantite * tarifJournalier * taux
    if (mesuree) e.mesurees += 1
    acc.set(l.materiel, e)
  }
  const parMateriel = [...acc.entries()]
    // `mesure` vaut vrai quand **toutes** les lignes retenues portent leurs
    // heures : un total mi-mesuré mi-estimé reste une estimation.
    .map(([materiel, e]) => ({
      materiel,
      joursMobilises: e.joursMobilises,
      coutEstime: e.coutEstime,
      mesure: e.mesurees > 0 && e.mesurees === materielLignes.filter((l) => l.materiel === materiel).length,
    }))
    .sort((a, b) => b.coutEstime - a.coutEstime)
  return { parMateriel, total: parMateriel.reduce((s, m) => s + m.coutEstime, 0) }
}

export interface CoutStandbyGlobal {
  personnel: { parProfil: CoutStandbyProfil[]; total: number }
  materiel: { parMateriel: CoutStandbyMateriel[]; total: number }
  total: number
}

// Coût NPT global (personnel + matériel) sur la période des lignes fournies.
export function coutStandbyGlobal(
  personnelLignes: PersonnelMobiliseLigne[],
  materielLignes: MaterielSiteLigne[],
  grille: GrilleTarifsNpt
): CoutStandbyGlobal {
  const personnel = coutStandbyPersonnel(personnelLignes, grille)
  const materiel = coutStandbyMateriel(materielLignes, personnelLignes, grille)
  return { personnel, materiel, total: personnel.total + materiel.total }
}
