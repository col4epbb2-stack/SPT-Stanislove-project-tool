import { chargerDonnee, chargerJournal } from '../lib/firestoreData'
import type { AffaireMetal, MetalKpiDashboard, MetalReferentiel } from '../types/travauxMetal'

// Données réelles extraites du classeur « KPI_ICP_2905.xlsm » : les 116
// affaires de la feuille "Travaux METAL" (rapport hebdo METAL - TOTAL GABON,
// semaine 29 - 2026), le référentiel "Data Travaux METAL" (listes + suivi des
// POs) et les zones figées de "KPI METAL" (backlog, budgets par champ).
// Servies par l'API (Firestore : collection `affaires_metal`, blobs pour le
// référentiel et le dashboard KPI).

export async function chargerAffairesMetal(): Promise<AffaireMetal[]> {
  return chargerJournal<AffaireMetal>('affaires-metal')
}

export async function chargerMetalReferentiel(): Promise<MetalReferentiel> {
  return chargerDonnee<MetalReferentiel>('metal__referentiel')
}

export async function chargerMetalKpiDashboard(): Promise<MetalKpiDashboard> {
  return chargerDonnee<MetalKpiDashboard>('metal__kpi-dashboard')
}
