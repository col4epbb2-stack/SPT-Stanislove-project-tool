import { chargerDonnee, chargerJournal } from '../lib/firestoreData'
import type {
  LigneActiviteFacturation,
  ListesDataFacturation,
  SuiviFacturationGmi,
  SyntheseFacturation,
  TarifsFacturationPoint,
} from '../types/facturationPoint'

// Données réelles extraites du classeur « Facturation au point -
// Construction_Intégrité CRP-PJC-CTA22C03_Février 2024.xlsb (1).xlsm »
// (contrat Échafaudage GMI CTA22C03). Servies par l'API (Firestore : blobs
// pour tarifs/listes/factures/synthèse figée, collection pour le journal
// "SUIVI DES ACTIVITES", 415 lignes).

export async function chargerTarifsFacturationPoint(): Promise<TarifsFacturationPoint> {
  return chargerDonnee<TarifsFacturationPoint>('facturation-point__tarifs')
}

export async function chargerListesDataFacturation(): Promise<ListesDataFacturation> {
  return chargerDonnee<ListesDataFacturation>('facturation-point__data-lists')
}

export async function chargerSuiviFacturationGmi(): Promise<SuiviFacturationGmi> {
  return chargerDonnee<SuiviFacturationGmi>('facturation-point__facturation-gmi')
}

export async function chargerSyntheseFacturation(): Promise<SyntheseFacturation> {
  return chargerDonnee<SyntheseFacturation>('facturation-point__synthese')
}

export async function chargerActivitesFacturation(): Promise<LigneActiviteFacturation[]> {
  return chargerJournal<LigneActiviteFacturation>('activites-facturation')
}
