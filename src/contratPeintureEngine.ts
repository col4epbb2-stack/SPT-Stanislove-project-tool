import type { LigneJournalPeinture, TarifPeinture } from '../types/contratPeinture'

// Moteur de calcul du classeur « Reporting CONTRAT PEINTURE » : réplique les
// formules de la feuille JOURNAL et les pivots des feuilles
// Synthèse_Facturation / CHECK / Feuil3, recalculés en direct à partir des
// lignes du journal.

// Abréviations françaises SANS point, telles que la colonne MOIS du classeur
// les écrit : ses 2 124 lignes portent « mars », « avr » et « mai » — les
// noms complets ("avril") qui étaient codés ici auraient fait diverger les
// 655 lignes d'avril et, surtout, dédoublé l'entrée du filtre Mois de
// l'onglet Journal dès la première saisie (il se construit sur les valeurs
// distinctes de cette colonne). Corrigé le 07/08/2026. Seuls mars / avr /
// mai sont vérifiables sur les données réelles ; les 9 autres suivent la
// même convention d'abréviation.
const MOIS_FR = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

export function moisDeDate(iso: string | null): string | null {
  if (!iso) return null
  const m = Number(iso.slice(5, 7))
  return Number.isInteger(m) && m >= 1 && m <= 12 ? MOIS_FR[m - 1] : null
}

/**
 * Colonnes calculées de la feuille JOURNAL :
 * - DUREE = fin − début + 1 (jours calendaires) — vérifié sur 738 lignes
 *   réelles, 0 écart
 * - % PREVISIONNEL = 1 / DUREE, donc entièrement déduit des dates de la
 *   période : c'est la part de l'ouvrage prévue par jour de planning.
 *   Vérifié sur les 738 lignes datées du classeur, 0 écart (07/08/2026 —
 *   auparavant écrit `surface prévisionnelle / surface totale`, qui donne le
 *   même résultat aux arrondis près puisque la surface prévisionnelle est
 *   elle-même surface totale / durée, mais qui demandait de saisir à la main
 *   une valeur que les dates suffisent à produire).
 * - SURFACE PREVISIONNELLE = surface totale / DUREE — vérifié sur 720
 *   lignes, 0 écart. Plus saisie non plus, pour la même raison.
 * - % REEL = surface réalisée / surface totale — vérifié sur 695 lignes,
 *   0 écart
 * - COUT TOTAL AU POINTAGE = QTE × coût unitaire au pointage
 * - COUT TOTAL STAND-BY MATERIEL = QTE × coût unitaire stand-by (forfait au
 *   tarif unitaire pour le MATERIEL sans quantité, cf. classeur)
 * - COUT TOTAL ANCIEN CONTRAT = QTE × coût unitaire ancien contrat
 * - SAVING = coût total ancien contrat − coût total au pointage
 * - FILTRE = 4 premiers caractères de la CATEGORIE, casse d'origine incluse
 * - MOIS = mois (français) de la DATE
 */
export function deriveLigneJournal(input: Omit<LigneJournalPeinture, 'id'>): Omit<LigneJournalPeinture, 'id'> {
  const qte = input.qte
  const duree = input.dateDebut && input.dateFin ? Math.round((Date.parse(input.dateFin) - Date.parse(input.dateDebut)) / 86_400_000) + 1 : null
  const coutTotalPointage = (qte ?? 0) * (input.coutUnitairePointage ?? 0)
  // Ligne sans quantité : le stand-by est facturé au forfait, à son tarif
  // unitaire. La règle valait ici pour la seule catégorie MATERIEL, ce qui
  // renvoyait 0 sur 394 lignes réelles (380 Consommable, 14 Personnel) où le
  // classeur facture bien le tarif ; élargie à toute ligne sans quantité le
  // 07/08/2026 — vérifiée ainsi sur les 1 996 lignes comparables, 0 écart
  // (contre 1 602 auparavant).
  const coutTotalStandByMateriel = qte == null ? (input.coutUnitaireStandBy ?? 0) : qte * (input.coutUnitaireStandBy ?? 0)
  const coutTotalAncienContrat = (qte ?? 0) * (input.coutUnitaireAncienContrat ?? 0)
  return {
    ...input,
    duree,
    // Sans dates, rien à déduire : la valeur déjà en place est conservée
    // plutôt qu'écrasée par du vide (la moitié des lignes réelles sont des
    // pointages stand-by/personnel sans période).
    surfacePrevisionnelle: duree && input.surfaceTotale != null ? input.surfaceTotale / duree : input.surfacePrevisionnelle,
    pctPrevisionnel: duree ? 1 / duree : input.pctPrevisionnel,
    pctReel: input.surfaceTotale && input.surfaceRealisee != null ? input.surfaceRealisee / input.surfaceTotale : input.pctReel,
    coutTotalPointage,
    coutTotalStandByMateriel,
    coutTotalAncienContrat,
    saving: coutTotalAncienContrat - coutTotalPointage,
    // Casse d'origine conservée : le classeur écrit "Cons"/"Pers" pour
    // "Consommable"/"Personnel" et "TRAV"/"PERS" pour "TRAVAUX"/"PERSONNEL".
    // Le `.toUpperCase()` qui était ici (fonction écrite mais jamais branchée
    // à une saisie) aurait fait diverger 610 des 2 124 lignes réelles —
    // corrigé le 06/08/2026 en branchant enfin le formulaire de saisie.
    filtre: input.categorie ? input.categorie.trim().slice(0, 4) : null,
    mois: moisDeDate(input.date),
  }
}

// RECHERCHEV sur la feuille DATA : coûts unitaires d'un type d'item.
export function lookupTarif(tarifs: TarifPeinture[], typeItem: string | null) {
  if (!typeItem) return null
  return tarifs.find((t) => t.typeItem.trim() === typeItem.trim()) ?? null
}

// Les 3 coûts unitaires d'une ligne viennent du référentiel DATA par type
// d'item (RECHERCHEV du classeur) — vérifié sans écart sur les lignes réelles
// où la comparaison est possible : pointage 1 040 lignes, stand-by 1 996,
// ancien contrat 194. Ils ne sont donc pas saisis mais repris du tarif.
export function coutsUnitairesDuTarif(
  tarifs: TarifPeinture[],
  typeItem: string | null
): Pick<LigneJournalPeinture, 'coutUnitairePointage' | 'coutUnitaireStandBy' | 'coutUnitaireAncienContrat'> {
  const tarif = lookupTarif(tarifs, typeItem)
  return {
    coutUnitairePointage: tarif?.tarifPointageReel ?? null,
    coutUnitaireStandBy: tarif?.tarifStandBy ?? null,
    coutUnitaireAncienContrat: tarif?.ancienContrat ?? null,
  }
}

export interface SyntheseSite {
  site: string
  qte: number
  coutTotalPointage: number
  part: number
}

// Pivot Synthèse_Facturation : Somme QTE / COUT TOTAL AU POINTAGE par SITE.
export function syntheseParSite(journal: LigneJournalPeinture[]): SyntheseSite[] {
  const acc = new Map<string, { qte: number; cout: number }>()
  for (const l of journal) {
    const site = l.site ?? '—'
    const e = acc.get(site) ?? { qte: 0, cout: 0 }
    e.qte += l.qte ?? 0
    e.cout += l.coutTotalPointage ?? 0
    acc.set(site, e)
  }
  const total = [...acc.values()].reduce((s, e) => s + e.cout, 0)
  return [...acc.entries()]
    .map(([site, e]) => ({ site, qte: e.qte, coutTotalPointage: e.cout, part: total ? e.cout / total : 0 }))
    .sort((a, b) => b.coutTotalPointage - a.coutTotalPointage)
}

export interface StandByLigne {
  typeItem: string
  site: string
  qte: number
  coutStandBy: number
}

// Les pivots Excel agrègent sans tenir compte de la casse.
const cle = (v: string | null | undefined, defaut = '—') => (v ?? '').trim().toUpperCase() || defaut

// Pivot CHECK / Feuil3 : stand-by (catégorie STD) par TYPE ITEM × SITE.
export function standByParTypeEtSite(journal: LigneJournalPeinture[]): StandByLigne[] {
  const acc = new Map<string, StandByLigne>()
  for (const l of journal) {
    if (cle(l.categorie) !== 'STD') continue
    const typeItem = cle(l.typeItem)
    const site = l.site ?? '—'
    const key = `${typeItem}|${site}`
    const e = acc.get(key) ?? { typeItem, site, qte: 0, coutStandBy: 0 }
    e.qte += l.qte ?? 0
    e.coutStandBy += l.coutStandBy ?? 0
    acc.set(key, e)
  }
  return [...acc.values()].sort((a, b) => a.typeItem.localeCompare(b.typeItem) || a.site.localeCompare(b.site))
}

/**
 * Courbe « SUIVI DES COUT STBY » (Feuil3) : coût de stand-by journalier =
 * somme de COUT TOTAL STAND-BY MATERIEL des lignes PERSONNEL, par date.
 */
export function courbeStandByJournaliere(journal: LigneJournalPeinture[]): { date: string; cout: number }[] {
  const acc = new Map<string, number>()
  for (const l of journal) {
    if (cle(l.categorie) !== 'PERSONNEL') continue
    acc.set(l.date, (acc.get(l.date) ?? 0) + (l.coutTotalStandByMateriel ?? 0))
  }
  return [...acc.entries()].map(([date, cout]) => ({ date, cout })).sort((a, b) => a.date.localeCompare(b.date))
}

// Pivot Feuil3 « HISTOGRAMME » : coût total au pointage par CATEGORIE.
export function coutParCategorie(journal: LigneJournalPeinture[]): { categorie: string; cout: number }[] {
  const acc = new Map<string, number>()
  for (const l of journal) {
    const cat = cle(l.categorie)
    acc.set(cat, (acc.get(cat) ?? 0) + (l.coutTotalPointage ?? 0))
  }
  return [...acc.entries()].map(([categorie, cout]) => ({ categorie, cout })).sort((a, b) => b.cout - a.cout)
}

export interface TotauxPeinture {
  coutTotalPointage: number
  coutStandBy: number
  coutAncienContrat: number
  saving: number
}

export function totauxJournal(journal: LigneJournalPeinture[]): TotauxPeinture {
  return journal.reduce(
    (t, l) => ({
      coutTotalPointage: t.coutTotalPointage + (l.coutTotalPointage ?? 0),
      coutStandBy: t.coutStandBy + (l.coutStandBy ?? 0),
      coutAncienContrat: t.coutAncienContrat + (l.coutTotalAncienContrat ?? 0),
      saving: t.saving + (l.saving ?? 0),
    }),
    { coutTotalPointage: 0, coutStandBy: 0, coutAncienContrat: 0, saving: 0 }
  )
}
