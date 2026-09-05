import { chargerDonnee } from '../lib/firestoreData'
import type { BackendGrandArret, DashboardGrandArret, GrilleFeuille, JournalGrandArret, SuiviGrandArret } from '../types/grandArret'

// Données réelles extraites du classeur « Grand arret_suivi préfabrication_
// VF_1005 (1).xlsm » (Grand arrêt AGM 2023). Les 7 feuilles sont reprises mot
// pour mot, y compris les feuilles masquées (SUIVI, Data, Backend, LUT MASTER
// Rév04). Servies par l'API (Firestore : blobs pour dashboard/backend/suivi/
// data/LUT MASTER, collection pour le Journal — cf. app_icp_api/CLAUDE.md).

export async function chargerDashboardGrandArret(): Promise<DashboardGrandArret> {
  return chargerDonnee<DashboardGrandArret>('grand-arret__dashboard')
}

// Feuille masquée « Backend » : source des deux graphiques en barres empilées
// 100 % du Dashboard (GLOBAL Prévisionnel / Réel) + TCD par phase.
export async function chargerBackendGrandArret(): Promise<BackendGrandArret> {
  return chargerDonnee<BackendGrandArret>('grand-arret__backend')
}

export async function chargerSuiviGrandArret(): Promise<SuiviGrandArret> {
  return chargerDonnee<SuiviGrandArret>('grand-arret__suivi')
}

export async function chargerJournalGrandArret(): Promise<JournalGrandArret> {
  return chargerDonnee<JournalGrandArret>('grand-arret__journal')
}

export async function chargerDataGrandArret(): Promise<GrilleFeuille> {
  return chargerDonnee<GrilleFeuille>('grand-arret__data-ref')
}

export async function chargerLutMasterRev04(): Promise<GrilleFeuille> {
  return chargerDonnee<GrilleFeuille>('grand-arret__lut-master-rev04')
}

export async function chargerLutMasterRev04_2(): Promise<GrilleFeuille> {
  return chargerDonnee<GrilleFeuille>('grand-arret__lut-master-rev04-2')
}
