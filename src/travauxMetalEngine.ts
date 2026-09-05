import type { AffaireMetal, AvancementMetal } from '../types/travauxMetal'

// Moteur de calcul des feuilles « Travaux METAL » / « KPI METAL » du classeur
// KPI_ICP_2905 : réplique les colonnes calculées de la table des affaires —
// cassées en #REF! dans le classeur, mais dont les formules restent lisibles
// dans le XML (statut corrigé, écarts/durées, avancement général prévisionnel
// = part du temps écoulé plafonnée à 100 %, avancement général réel = moyenne
// des avancements de phases, contrôles CFP/CFT) — ainsi que les pivots du KPI
// dérivables des affaires (avancements moyens par champ × type d'avis,
// répartitions, demandes par période, taux de traitement).

const MS_PAR_JOUR = 86_400_000

const MOIS_COURTS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

function jours(date1: string | null, date2: string | null): number | null {
  if (!date1 || !date2) return null
  return Math.round((new Date(date2).getTime() - new Date(date1).getTime()) / MS_PAR_JOUR)
}

// Valeur numérique d'un avancement ("NA" et vide sont exclus des moyennes).
export function avancementNumerique(v: AvancementMetal): number | null {
  return typeof v === 'number' ? v : null
}

// Colonne "Statut corrigé" : Terminée si le statut travaux commence par
// "Soldée" ou "Ter".
export function statutCorrige(a: AffaireMetal): string {
  const s = (a.statutTravaux ?? '').trim()
  return s.startsWith('Soldée') || s.startsWith('Ter') ? 'Terminée' : ''
}

export function estSoldee(a: AffaireMetal): boolean {
  return (a.statutTravaux ?? '').trim().startsWith('Soldée')
}

// Écart 1 / durée de traitement de la demande = début planning − demande.
export function dureeTraitementDemande(a: AffaireMetal): number | null {
  return jours(a.dateDemande, a.dateDebutPlanning)
}

// Écart 2 / durée du projet = fin réelle − début réel.
export function dureeProjet(a: AffaireMetal): number | null {
  return jours(a.dateDebutReel, a.dateFinReel)
}

// Durée / planning = fin prévisionnelle − début planning.
export function dureePlanning(a: AffaireMetal): number | null {
  return jours(a.dateDebutPlanning, a.dateFinPlanningPrev)
}

// Avancement général prévisionnel = (AUJOURDHUI − début + 1) / (fin prév −
// début + 1), plafonné à 100 % — "NA" si les dates manquent.
export function avancementGeneralPrev(a: AffaireMetal, aujourdhui: Date = new Date()): number | null {
  if (!a.dateDebutPlanning || !a.dateFinPlanningPrev) return null
  const debut = new Date(a.dateDebutPlanning).getTime()
  const fin = new Date(a.dateFinPlanningPrev).getTime()
  const duree = (fin - debut) / MS_PAR_JOUR + 1
  if (duree <= 0) return null
  const ecoule = (aujourdhui.getTime() - debut) / MS_PAR_JOUR + 1
  return Math.min(1, Math.max(0, ecoule / duree))
}

// Avancement général réel = moyenne des avancements de phases renseignés
// (étude, fourniture, préfabrication, travaux sur site).
export function avancementGeneralReel(a: AffaireMetal): number | null {
  const phases = [a.avancementEtude, a.avancementFourniture, a.avancementPrefab, a.avancementTravauxSite]
    .map(avancementNumerique)
    .filter((v): v is number => v != null)
  if (phases.length === 0) return null
  return phases.reduce((s, v) => s + v, 0) / phases.length
}

// Contrôles CFP / CFT : OK si applicable OUI avec date renseignée, OK si NON,
// sinon IN PROGRESS.
function checkDocument(applicable: string | null, date: string | null): string {
  const app = (applicable ?? '').trim().toUpperCase()
  if (app === 'OUI' && date) return 'OK'
  if (app === 'NON') return 'OK'
  return 'IN PROGRESS'
}

export function checkCfp(a: AffaireMetal): string {
  return checkDocument(a.cfpApplicable, a.cfpDate)
}

export function checkCft(a: AffaireMetal): string {
  return checkDocument(a.cftApplicable, a.cftDate)
}

// Check DFA (04/09/2026, lot 3 du recueil, MET-23) : même règle que CFP/CFT —
// OK si applicable OUI avec date de validation renseignée, OK si NON, sinon
// IN PROGRESS. Avant ce lot, `dfa` seul (Oui/Non) suffisait à sortir
// l'affaire de `enAttenteDocumentation` ; le document demande explicitement
// de « dire si le DFA a été validé », distinct du simple Oui/Non.
export function checkDfa(a: AffaireMetal): string {
  return checkDocument(a.dfa, a.dfaDate)
}

// En attente de DFA / CFP ou CFT : documentation finale incomplète.
export function enAttenteDocumentation(a: AffaireMetal): boolean {
  return checkCfp(a) !== 'OK' || checkCft(a) !== 'OK' || checkDfa(a) !== 'OK'
}

// Statut automatique (04/09/2026, lot 3 du recueil, MET-42→45) : « le statut
// ne doit plus être renseigné manuellement ». CLOSED seulement quand
// l'avancement général réel atteint 100 %, IN PROGRESS dans tous les autres
// cas — y compris quand aucune phase n'est encore chiffrée
// (avancementGeneralReel() rend `null`) : une affaire qui n'a pas commencé
// n'est jamais "terminée" par défaut (Q4 du recueil). Vérifié sur les 116
// affaires réelles : 107/112 lignes à statut connu concordent déjà, les 5
// désaccords sont des affaires à 100 % d'avancement laissées "IN PROGRESS"
// par la saisie manuelle — exactement la dérive que cette règle supprime.
export function statutAutomatique(a: AffaireMetal): string {
  return avancementGeneralReel(a) === 1 ? 'CLOSED' : 'IN PROGRESS'
}

export function periodeDe(date: string | null): string | null {
  if (!date) return null
  const m = Number(date.slice(5, 7))
  if (!Number.isInteger(m) || m < 1 || m > 12) return null
  return `${MOIS_COURTS[m - 1]} ${date.slice(0, 4)}`
}

// ---------------------------------------------------------------------------
// Pivots de la feuille KPI METAL, recalculés depuis la table des affaires.

export interface AvancementChampTypeAvis {
  champ: string
  typeAvis: string
  nombre: number
  moyennePrev: number | null
  moyenneReel: number | null
  ecart: number | null
}

export function avancementParChampTypeAvis(
  affaires: AffaireMetal[],
  aujourdhui: Date = new Date()
): AvancementChampTypeAvis[] {
  const acc = new Map<string, { champ: string; typeAvis: string; n: number; prev: number[]; reel: number[] }>()
  for (const a of affaires) {
    const champ = a.champ ?? '—'
    const typeAvis = a.typeAvis ?? '—'
    const key = `${champ}|${typeAvis}`
    const e = acc.get(key) ?? { champ, typeAvis, n: 0, prev: [], reel: [] }
    e.n += 1
    const p = avancementGeneralPrev(a, aujourdhui)
    if (p != null) e.prev.push(p)
    const r = avancementGeneralReel(a)
    if (r != null) e.reel.push(r)
    acc.set(key, e)
  }
  const moyenne = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)
  return [...acc.values()]
    .map((e) => {
      const prev = moyenne(e.prev)
      const reel = moyenne(e.reel)
      return {
        champ: e.champ,
        typeAvis: e.typeAvis,
        nombre: e.n,
        moyennePrev: prev,
        moyenneReel: reel,
        ecart: prev != null && reel != null ? reel - prev : null,
      }
    })
    .sort((a, b) => a.champ.localeCompare(b.champ) || a.typeAvis.localeCompare(b.typeAvis))
}

export interface JaugesAvancement {
  prev: number | null
  reel: number | null
  ecart: number | null
}

export function jaugesAvancement(affaires: AffaireMetal[], aujourdhui: Date = new Date()): JaugesAvancement {
  const prev = affaires.map((a) => avancementGeneralPrev(a, aujourdhui)).filter((v): v is number => v != null)
  const reel = affaires.map((a) => avancementGeneralReel(a)).filter((v): v is number => v != null)
  const mPrev = prev.length ? prev.reduce((s, v) => s + v, 0) / prev.length : null
  const mReel = reel.length ? reel.reduce((s, v) => s + v, 0) / reel.length : null
  return { prev: mPrev, reel: mReel, ecart: mPrev != null && mReel != null ? mReel - mPrev : null }
}

export interface RepartitionMetal {
  libelle: string
  nombre: number
}

export function repartitionPar(
  affaires: AffaireMetal[],
  cle: (a: AffaireMetal) => string | null
): RepartitionMetal[] {
  const acc = new Map<string, number>()
  for (const a of affaires) {
    const k = (cle(a) ?? '(vide)').trim() || '(vide)'
    acc.set(k, (acc.get(k) ?? 0) + 1)
  }
  return [...acc.entries()].map(([libelle, nombre]) => ({ libelle, nombre })).sort((a, b) => b.nombre - a.nombre)
}

export interface TauxTraitement {
  total: number
  terminees: number
  soldees: number
  enAttenteDocumentation: number
}

export function tauxTraitement(affaires: AffaireMetal[]): TauxTraitement {
  return {
    total: affaires.length,
    terminees: affaires.filter((a) => statutCorrige(a) === 'Terminée').length,
    soldees: affaires.filter(estSoldee).length,
    enAttenteDocumentation: affaires.filter((a) => statutCorrige(a) === 'Terminée' && enAttenteDocumentation(a)).length,
  }
}

export interface DemandesParPeriode {
  periode: string
  code: number
  nombre: number
}

// Nombre de demandes (ou de fins de travaux) par période "mmm aaaa".
export function comptageParPeriode(
  affaires: AffaireMetal[],
  date: (a: AffaireMetal) => string | null
): DemandesParPeriode[] {
  const acc = new Map<number, { periode: string; nombre: number }>()
  for (const a of affaires) {
    const d = date(a)
    const periode = periodeDe(d)
    if (!d || !periode) continue
    const code = Number(d.slice(0, 4)) * 100 + Number(d.slice(5, 7))
    const e = acc.get(code) ?? { periode, nombre: 0 }
    e.nombre += 1
    acc.set(code, e)
  }
  return [...acc.entries()]
    .map(([code, e]) => ({ code, periode: e.periode, nombre: e.nombre }))
    .sort((a, b) => a.code - b.code)
}
