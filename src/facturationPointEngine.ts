import type { LigneActiviteFacturation, TarifsFacturationPoint } from '../types/facturationPoint'

// Réplique les colonnes calculées du Tableau1 de la feuille
// "SUIVI DES ACTIVITES" du classeur « Facturation au point -
// Construction_Intégrité CRP-PJC-CTA22C03_Février 2024 » (contrat GMI
// CTA22C03). Chaque fonction correspond à une colonne de la feuille ;
// la réplication a été vérifiée sans écart sur les 415 lignes du classeur.

export const MOIS_FACTURATION = [
  'janv',
  'févr',
  'mars',
  'avr',
  'mai',
  'juin',
  'juil',
  'août',
  'sept',
  'oct',
  'nov',
  'déc',
] as const

function estOui(v: string | null): boolean {
  return (v ?? '').trim().toUpperCase() === 'OUI'
}

function estOffshore(l: LigneActiviteFacturation): boolean {
  return (l.lieu ?? '').trim().toUpperCase() === 'OFFSHORE'
}

// Colonne SURFACE = LONGUEUR × LARGEUR.
export function surfaceActivite(l: LigneActiviteFacturation): number {
  return (l.longueur ?? 0) * (l.largeur ?? 0)
}

// Colonne M3 = HAUTEUR × SURFACE.
export function m3Activite(l: LigneActiviteFacturation): number {
  return (l.hauteur ?? 0) * surfaceActivite(l)
}

// Colonne NOMBRE DE JOURS FACTURÉS = ...AU − FACTURATION DU + 1 (peut être
// négatif sur les lignes de régularisation, comme dans le classeur).
export function nbJoursFactures(l: LigneActiviteFacturation): number | null {
  if (!l.du || !l.au) return null
  const ms = new Date(l.au).getTime() - new Date(l.du).getTime()
  return Math.round(ms / 86_400_000) + 1
}

// Colonne m3/j = M3 × NOMBRE DE JOURS FACTURÉS.
export function m3Jours(l: LigneActiviteFacturation): number | null {
  const nj = nbJoursFactures(l)
  return nj == null ? null : m3Activite(l) * nj
}

// Colonnes POINT 1 / POINT 2 / COEFF / TARIF (XLOOKUP sur le barème).
export function coeffSuspendu(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return estOui(l.suspendu) ? t.bareme.coeffSuspendu : 1
}

export function coeffAssistance(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return estOui(l.assistance) ? t.bareme.coeffAssistance : 1
}

export function coeffLieu(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return estOffshore(l) ? t.bareme.coeffOffshore : t.bareme.coeffOnshore
}

export function tarifPoint(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return estOffshore(l) ? t.bareme.tarifPointOffshore : t.bareme.tarifPointOnshore
}

// Colonne H RETRAITÉ 1 = hauteur arrondie à l'entier supérieur, minimum 2.
export function hauteurRetraitee(l: LigneActiviteFacturation): number {
  const h = Math.ceil(l.hauteur ?? 0)
  return h < 2 ? 2 : h
}

// Colonne EQUATION (texte "Pt = a.S + b" du barème pour la hauteur retraitée).
export function equationActivite(l: LigneActiviteFacturation, t: TarifsFacturationPoint): string | null {
  const eq = t.bareme.equations.find((e) => e.h === hauteurRetraitee(l))
  return eq ? `Pt = ${eq.equation}` : null
}

// Colonne NOMBRE DE POINTS POSE / DÉPOSE = a × SURFACE + b.
export function nombrePoints(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  const eq = t.bareme.equations.find((e) => e.h === hauteurRetraitee(l))
  if (!eq) return 0
  return eq.a * surfaceActivite(l) + eq.b
}

// Colonne COÛT TOTAL XAF POSE / DÉPOSE = points × tarif × coeff lieu ×
// coeff assistance × coeff suspendu.
export function coutPoseDepose(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return (
    nombrePoints(l, t) * tarifPoint(l, t) * coeffLieu(l, t) * coeffAssistance(l, t) * coeffSuspendu(l, t)
  )
}

// Colonnes COEFF TRAVAIL DE NUIT (pose / dépose).
export function coeffNuitPose(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  if (!estOui(l.nuitPose)) return 1
  return estOffshore(l) ? t.coeffNuitOffshore : t.coeffNuitOnshore
}

export function coeffNuitDepose(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  if (!estOui(l.nuitDepose)) return 1
  return estOffshore(l) ? t.coeffNuitOffshore : t.coeffNuitOnshore
}

// Colonne MONTANT POSE À FACTURER CE MOIS-CI = coût pose/dépose × taux pose
// (70 %) × coeff nuit, si POSE = OUI.
export function montantPose(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  if (!estOui(l.pose)) return 0
  return coutPoseDepose(l, t) * t.bareme.tauxPose * coeffNuitPose(l, t)
}

// Colonne MONTANT DÉPOSE À FACTURER CE MOIS-CI (taux dépose 30 %).
export function montantDepose(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  if (!estOui(l.depose)) return 0
  return coutPoseDepose(l, t) * t.bareme.tauxDepose * coeffNuitDepose(l, t)
}

// Colonne MONTANT NDC À FACTURER CE MOIS-CI (note de calcul forfaitaire).
export function montantNdc(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  if (!estOui(l.ndc)) return 0
  return estOffshore(l) ? t.ndcOffshore : t.ndcOnshore
}

// Colonne "Si utilisation >30 jours" = jours facturés − (<15 j) − (<30 j).
export function joursPlus30(l: LigneActiviteFacturation): number {
  return (nbJoursFactures(l) ?? 0) - (l.joursMoins15 ?? 0) - (l.joursMoins30 ?? 0)
}

function nbJours(du: string | null, au: string | null): number {
  if (!du || !au) return 0
  return Math.round((new Date(au).getTime() - new Date(du).getTime()) / 86_400_000) + 1
}

export interface RepartitionPaliers {
  joursMoins15: number
  joursMoins30: number
}

// Répartition automatique des paliers <15j/<30j (04/08/2026, doc/suivi
// tonnage.docx) : contrainte Excel levée — une même demande peut être
// facturée sur plusieurs mois, le palier tarifaire applicable dépend donc de
// la durée CUMULÉE déjà facturée pour cette demande, pas seulement des jours
// de la ligne en cours (ex. 20 j déjà facturés + 10 j sur cette ligne = ces
// 10 j tombent dans le palier >30j, pas <15j). Utilisée uniquement à la
// saisie (ActiviteFacturationSaisieForm) pour pré-remplir joursMoins15/
// joursMoins30 avant enregistrement — les 415 lignes historiques importées
// gardent leurs valeurs telles quelles, jamais recalculées rétroactivement.
export function repartitionPaliersAutomatique(
  du: string | null,
  au: string | null,
  numeroDemande: string | null,
  activitesExistantes: LigneActiviteFacturation[]
): RepartitionPaliers {
  const joursLigne = nbJours(du, au)
  if (joursLigne <= 0) return { joursMoins15: 0, joursMoins30: 0 }

  const cumulPrecedent = numeroDemande
    ? activitesExistantes
        .filter((l) => l.numeroDemande === numeroDemande && l.au != null && du != null && l.au < du)
        .reduce((s, l) => s + (nbJoursFactures(l) ?? 0), 0)
    : 0

  const dansPalier15 = Math.max(0, Math.min(joursLigne, 15 - cumulPrecedent))
  const dansPalier30 = Math.max(0, Math.min(joursLigne - dansPalier15, 30 - Math.max(cumulPrecedent, 15)))
  return { joursMoins15: dansPalier15, joursMoins30: dansPalier30 }
}

// Colonne NOMBRE DE POINTS LOCATIONS = (j<15 × 0,8 + j<30 × 0,6 + j>30 × 0,4)
// × (H retraitée × surface) — coefficients de dégressivité du bordereau.
export function nombrePointsLocation(l: LigneActiviteFacturation): number {
  const degressif = (l.joursMoins15 ?? 0) * 0.8 + (l.joursMoins30 ?? 0) * 0.6 + joursPlus30(l) * 0.4
  return degressif * (hauteurRetraitee(l) * surfaceActivite(l))
}

// Colonnes COÛT DU POINT et COÛT LOCATION CE MOIS-CI.
export function coutDuPointLocation(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return estOffshore(l) ? t.pointLocationOffshore : t.pointLocationOnshore
}

export function coutLocation(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return coutDuPointLocation(l, t) * nombrePointsLocation(l)
}

// Colonnes de régie : heures saisies × tarif jour / 12 (le tarif horaire du
// TABLEAU_REGIE est le tarif journalier divisé par 12). Onshore (Ile Mandji),
// chef d'équipe et coordinateur partagent le même tarif.
export function coutRegieChef(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  const tarif = estOffshore(l) ? t.tarifJourChefOffshore : t.tarifJourChefCoordinateurOnshore
  return ((l.chefEquipeHeures ?? 0) * tarif) / 12
}

export function coutRegieCoordinateur(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  const tarif = estOffshore(l) ? t.tarifJourCoordinateurOffshore : t.tarifJourChefCoordinateurOnshore
  return ((l.coordinateurHeures ?? 0) * tarif) / 12
}

export function coutRegieMonteurs(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  const tarif = estOffshore(l) ? t.tarifJourMonteursOffshore : t.tarifJourMonteursOnshore
  return ((l.monteursHeures ?? 0) * tarif) / 12
}

export function coutRegie(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return coutRegieChef(l, t) + coutRegieCoordinateur(l, t) + coutRegieMonteurs(l, t)
}

// Colonne COÛT TOTAL À FACTURER CE MOIS-CI.
export function coutTotalActivite(l: LigneActiviteFacturation, t: TarifsFacturationPoint): number {
  return montantPose(l, t) + montantDepose(l, t) + montantNdc(l, t) + coutLocation(l, t) + coutRegie(l, t)
}

// Colonnes PERIODE / ANNEE / ANNEE2.
export function periodeActivite(l: LigneActiviteFacturation): string | null {
  if (!l.mois) return null
  return MOIS_FACTURATION[Number(l.mois.slice(5, 7)) - 1] ?? null
}

export function anneeActivite(l: LigneActiviteFacturation): number | null {
  return l.au ? Number(l.au.slice(0, 4)) : null
}

export function periodeAnnee(l: LigneActiviteFacturation): string | null {
  const p = periodeActivite(l)
  const a = anneeActivite(l)
  return p && a != null ? `${p}-${a}` : null
}

// Feuille "SUIVI DE FACTURATION" — colonnes calculées du Tableau14.
// N° de facture = CODE/GMI/mm/aa.
export function numeroFacture(code: string, mois: string | null): string {
  if (!mois) return `${code}/GMI/`
  return `${code}/GMI/${mois.slice(5, 7)}/${mois.slice(2, 4)}`
}

export function anneeFacture(mois: string | null): number | null {
  return mois ? Number(mois.slice(0, 4)) : null
}
