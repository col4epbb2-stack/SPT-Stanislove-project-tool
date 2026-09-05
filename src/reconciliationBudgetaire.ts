import type { ProjetFeuilleDeRoute } from '../types/feuilleDeRoute'
import type { LigneNavette } from '../types/navette'
import { totalBudget } from '../types/navette'
import type { Projet } from '../types/project'
import { normaliser } from './liaison'

// Réconciliation budgétaire (Logique_metier_liaisons_ICP.docx §3.3, Phase 4)
// : colonnes calculées, jamais de fusion des modules ni de correction
// automatique — l'écart lui-même est l'information utile (CDS).

export interface EcartFdrNavette {
  ligneNavette: LigneNavette
  budgetFdrKusd: number | null
  budgetNavetteKusd: number
  cycleUtilise: 'PDC02' | 'BU'
  ecartKusd: number | null
  ecartPct: number | null
}

// Feuille de route ↔ Navette : compteImputation = codeOTP, la clé la plus
// fiable du document (92 % mesuré sur les 84 lignes FdR). `pdc02_2026_kusd`
// est comparé au cycle Navette correspondant (PDC02), avec repli sur BU si
// PDC02 n'est pas encore chiffré sur la ligne.
export function ecartBudgetaire(fdr: ProjetFeuilleDeRoute, lignesNavette: LigneNavette[]): EcartFdrNavette | null {
  const otp = normaliser(fdr.compteImputation ?? fdr.otp)
  if (!otp) return null
  const ligneNavette = lignesNavette.find((l) => normaliser(l.codeOTP) === otp)
  if (!ligneNavette) return null

  const totalPDC02 = totalBudget(ligneNavette.cycles.PDC02)
  const cycleUtilise: 'PDC02' | 'BU' = totalPDC02 > 0 ? 'PDC02' : 'BU'
  const budgetNavetteKusd = totalPDC02 > 0 ? totalPDC02 : totalBudget(ligneNavette.cycles.BU)
  const budgetFdrKusd = fdr.pdc02_2026_kusd ?? fdr.bu26ServKusd

  const ecartKusd = budgetFdrKusd != null ? budgetFdrKusd - budgetNavetteKusd : null
  const ecartPct = ecartKusd != null && budgetNavetteKusd !== 0 ? Math.round((ecartKusd / budgetNavetteKusd) * 1000) / 10 : null

  return { ligneNavette, budgetFdrKusd, budgetNavetteKusd, cycleUtilise, ecartKusd, ecartPct }
}

export interface CoherenceRealiseYTD {
  realiseYTDNavette: number
  cumulCommandes: number
  cumulProjet: number
  ecart: number
}

// Navette.realiseYTD ↔ cumul réel du projet lié (ligne.projetId — lien direct
// déjà existant, pas une résolution floue) : commandes (PO). Indicateur de
// cohérence, pas une correction : les deux chiffres proviennent de saisies
// indépendantes (doc §1.1 point 6). Les consommations de contrat vivent
// désormais dans le référentiel portfolio (contratsEngine.ts, fusion des
// deux systèmes de contrats) et non plus sur le document Projet — les inclure
// ici demanderait un fetch Firestore asynchrone supplémentaire ; cette
// fonction reste pure/synchrone (logique pas encore branchée à l'UI).
export function coherenceRealiseYTD(ligneNavette: LigneNavette, projet: Projet): CoherenceRealiseYTD {
  const realiseYTDNavette = totalBudget(ligneNavette.cycles.realiseYTD)
  const cumulCommandes = projet.commandes.reduce((s, c) => s + c.montant, 0)
  return { realiseYTDNavette, cumulCommandes, cumulProjet: cumulCommandes, ecart: realiseYTDNavette - cumulCommandes }
}
