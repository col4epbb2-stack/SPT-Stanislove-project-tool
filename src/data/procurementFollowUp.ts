import { chargerDonnee, chargerJournal } from '../lib/firestoreData'
import type {
  ArticleSurveillance,
  DashboardPrepMateriel,
  JournalAoProcurement,
  JournalDaProcurement,
  JournalPoProcurement,
  ProcurementCharts,
  SuiviPrefaProcurement,
  TransitProcurement,
} from '../types/procurementFollowUp'

// Données réelles extraites du classeur « Copie de PROCUREMENT FOLLOW
// UP_REV00_S19 VF.xlsm ». Servies par l'API (Firestore : blobs pour les
// journaux/dashboard/transit, collection pour la table de surveillance —
// 1 612 articles).

export async function chargerJournalDaProcurement(): Promise<JournalDaProcurement> {
  return chargerDonnee<JournalDaProcurement>('procurement__journal-da')
}

export async function chargerJournalAoProcurement(): Promise<JournalAoProcurement> {
  return chargerDonnee<JournalAoProcurement>('procurement__journal-ao')
}

export async function chargerJournalPoProcurement(): Promise<JournalPoProcurement> {
  return chargerDonnee<JournalPoProcurement>('procurement__journal-po')
}

export async function chargerSuiviPrefaProcurement(): Promise<SuiviPrefaProcurement> {
  return chargerDonnee<SuiviPrefaProcurement>('procurement__suivi-prefa')
}

export async function chargerTransitProcurement(): Promise<TransitProcurement> {
  return chargerDonnee<TransitProcurement>('procurement__transit')
}

export async function chargerDashboardPrepMateriel(): Promise<DashboardPrepMateriel> {
  return chargerDonnee<DashboardPrepMateriel>('procurement__dashboard-prep')
}

// Séries des 28 graphiques du classeur (histogrammes de durées vs date
// critique, jauges avancement/restant, ETA reçu/non reçu), reprises telles
// quelles. Les statuts AO sont recalculés depuis le journal (le pivot en
// cache du classeur était périmé).
export async function chargerProcurementCharts(): Promise<ProcurementCharts> {
  return chargerDonnee<ProcurementCharts>('procurement__charts')
}

export async function chargerSurveillance(): Promise<ArticleSurveillance[]> {
  return chargerJournal<ArticleSurveillance>('surveillance-procurement')
}
