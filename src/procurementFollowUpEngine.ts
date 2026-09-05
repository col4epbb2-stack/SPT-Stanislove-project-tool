import type {
  ArticleSurveillance,
  DaProcurement,
  EvenementDuree,
  HistoDureeMois,
  LignePrefa,
  PoProcurement,
} from '../types/procurementFollowUp'

// Moteur du module Procurement follow-up : réplique les colonnes calculées
// du Journal PO (durées de fabrication, gaps prévisionnel/réel) et les
// pivots du dashboard de surveillance, recalculés en direct depuis les
// données extraites. Les dates saisies en texte dans le classeur ne sont
// pas calculables : elles sont exclues des durées (null).

const MS_PAR_JOUR = 86_400_000
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/

function joursEntre(date1: string | null, date2: string | null): number | null {
  if (!date1 || !date2 || !RE_ISO.test(date1) || !RE_ISO.test(date2)) return null
  return Math.round((new Date(date2).getTime() - new Date(date1).getTime()) / MS_PAR_JOUR)
}

// Délai de fabrication réel = livraison réelle EXW − transmission du PO.
export function dureeFabricationReelle(po: PoProcurement): number | null {
  return joursEntre(po.dateTransmissionPo, po.dateLivraisonReelExw)
}

// Gap EXW = livraison réelle − livraison prévisionnelle (positif = retard).
export function gapExw(po: PoProcurement): number | null {
  return joursEntre(po.dateLivraisonPrevExw, po.dateLivraisonReelExw)
}

export function gapMaritime(po: PoProcurement): number | null {
  return joursEntre(po.etaPrevMaritime, po.etaReelMaritime)
}

export function gapAerien(po: PoProcurement): number | null {
  return joursEntre(po.etaPrevAerien, po.etaReelAerien)
}

export interface RepartitionProcurement {
  libelle: string
  nombre: number
}

export function repartitionArticles(
  articles: ArticleSurveillance[],
  cle: (a: ArticleSurveillance) => string | null
): RepartitionProcurement[] {
  const acc = new Map<string, number>()
  for (const a of articles) {
    const k = (cle(a) ?? '(vide)').trim() || '(vide)'
    acc.set(k, (acc.get(k) ?? 0) + 1)
  }
  return [...acc.entries()].map(([libelle, nombre]) => ({ libelle, nombre })).sort((a, b) => b.nombre - a.nombre)
}

export interface SyntheseSurveillance {
  total: number
  closed: number
  inProgress: number
  avisMadOui: number
  livresMagasin: number
  avancementMoyen: number | null
}

export function syntheseSurveillance(articles: ArticleSurveillance[]): SyntheseSurveillance {
  const avancements = articles.map((a) => a.avancement).filter((v): v is number => v != null)
  return {
    total: articles.length,
    closed: articles.filter((a) => (a.statut ?? '').trim().toUpperCase() === 'CLOSED').length,
    inProgress: articles.filter((a) => (a.statut ?? '').trim().toUpperCase() === 'IN PROGRESS').length,
    avisMadOui: articles.filter((a) => (a.avisMad ?? '').trim().toUpperCase() === 'OUI').length,
    livresMagasin: articles.filter((a) => !!a.dateLivraisonMagasin).length,
    avancementMoyen: avancements.length ? avancements.reduce((s, v) => s + v, 0) / avancements.length : null,
  }
}

// --- Séries des histogrammes du classeur ----------------------------------
// Mise en forme des séries reprises du classeur pour l'affichage (libellé,
// durée, détail en infobulle) — pure mise en forme, aucun calcul.

export interface PointHistoDuree {
  libelle: string
  duree: number
  detail: string
}

export function evenementsVersHisto(evts: EvenementDuree[]): PointHistoDuree[] {
  return evts.map((e) => ({
    libelle: e.po ?? e.fournisseur ?? '—',
    duree: e.duree,
    detail: [e.plateforme, e.semaine, e.date ?? e.periode].filter(Boolean).join(' · '),
  }))
}

export function histoMoisVersHisto(evts: HistoDureeMois[]): PointHistoDuree[] {
  return evts.map((e) => ({
    libelle: e.po,
    duree: e.duree,
    detail: [e.mois, e.semaine != null ? `s${e.semaine}` : null].filter(Boolean).join(' · '),
  }))
}

// --- Résumés recalculés depuis les lignes ---------------------------------
// Ces deux résumés venaient figés des blobs du classeur ; ils sont désormais
// recalculés depuis les lignes (06/08/2026) pour rester justes une fois des
// saisies ajoutées. Vérifiés à l'identique sur les données réelles avant
// bascule : DA 57 in progress / 25 closed sur 82 lignes ; préfabrication
// qté totale 1 342, dont 895 livrées et 447 non livrées (66,7 % / 33,3 %).

export function resumeStatutsDa(das: DaProcurement[]): { inProgress: number; closed: number } {
  let inProgress = 0
  let closed = 0
  for (const d of das) {
    const s = (d.statut ?? '').trim().toUpperCase()
    if (s === 'CLOSED') closed += 1
    else if (s === 'IN PROGRESS') inProgress += 1
  }
  return { inProgress, closed }
}

export interface ResumePrefa {
  qteTotale: number
  livraisonMagasinOui: number
  livraisonMagasinNon: number
  pctOui: number | null
  pctNon: number | null
}

// Les compteurs OUI/NON sont des QUANTITÉS (somme des qte), pas des nombres
// de lignes — vérifié sur les données réelles (895 = somme des qte des lignes
// livrées, pour 36 lignes seulement).
export function resumePrefa(lignes: LignePrefa[]): ResumePrefa {
  let qteTotale = 0
  let oui = 0
  let non = 0
  for (const l of lignes) {
    const q = l.qte ?? 0
    qteTotale += q
    const livre = (l.livraisonMagasin ?? '').trim().toUpperCase()
    if (livre === 'OUI') oui += q
    else if (livre === 'NON') non += q
  }
  return {
    qteTotale,
    livraisonMagasinOui: oui,
    livraisonMagasinNon: non,
    pctOui: qteTotale > 0 ? oui / qteTotale : null,
    pctNon: qteTotale > 0 ? non / qteTotale : null,
  }
}

// Reste à livrer au contractant = besoin − quantité déjà livrée. Colonne du
// classeur, vérifiée sans écart sur les 67 lignes réelles : elle est donc
// dérivée plutôt que saisie.
export function resteALivrerPrefa(l: Pick<LignePrefa, 'besoinCtr' | 'qteLivreeCtr'>): number | null {
  if (l.besoinCtr == null && l.qteLivreeCtr == null) return null
  return (l.besoinCtr ?? 0) - (l.qteLivreeCtr ?? 0)
}
