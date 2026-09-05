import { chargerDonnee, chargerJournal } from '../lib/firestoreData'
import type {
  LigneJournalTonnage,
  LignePersonnelTonnage,
  ObjectifJournalierChamp,
  PersonnelAnnexe,
  SuiviEchafSheet,
  TonnageContrat,
} from '../types/tonnageEchaf'

// Données réelles extraites du classeur « SUIVI TONNAGE ECHAFAUDAGES_26-06-2026.xlsm ».
// Servies par l'API (Firestore : collections pour le Journal — 7 911 lignes
// — et le Suivi personnel — 3 384 lignes —, blobs pour le reste).

export async function chargerTonnageContrat(): Promise<TonnageContrat> {
  return chargerDonnee<TonnageContrat>('tonnage-echaf__contrat')
}

export async function chargerObjectifJournalierChamp(): Promise<ObjectifJournalierChamp[]> {
  return chargerDonnee<ObjectifJournalierChamp[]>('tonnage-echaf__objectif-journalier')
}

export async function chargerPersonnelAnnexe(): Promise<PersonnelAnnexe> {
  return chargerDonnee<PersonnelAnnexe>('tonnage-echaf__personnel-annexe')
}

// Feuille "SUIVI TONNAGE_ECHAF" reprise fidèlement, valeurs figées du
// classeur (situation au 28/06/2026 — S27) : résumé des moyennes de poids,
// tables journalières AGM/IM/TRM, TCD poids journalier/sites/demandes et
// table des retards/pertes de dépose.
export async function chargerSuiviEchafSheet(): Promise<SuiviEchafSheet> {
  return chargerDonnee<SuiviEchafSheet>('tonnage-echaf__suivi')
}

export async function chargerJournalTonnage(): Promise<LigneJournalTonnage[]> {
  return chargerJournal<LigneJournalTonnage>('tonnage')
}

export async function chargerPersonnelTonnage(): Promise<LignePersonnelTonnage[]> {
  return chargerJournal<LignePersonnelTonnage>('personnel-tonnage')
}
