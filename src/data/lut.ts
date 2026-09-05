import { chargerDonnee } from '../lib/firestoreData'
import type { GrilleFeuille } from '../types/grandArret'

// Données réelles extraites des classeurs « LUT_AGM 20260213.xlsx »,
// « LUT_MDJ 20260213.xlsx » et « LUT_TRM 20260213.xlsx » (feuille Feuil1 de
// chacune, reprise mot pour mot) : listes des avis d'intégrité par site avec
// avancement survey / MTO / plan / préfabrication. Servies par l'API
// (Firestore, blobs `donnees_referentiels`) à l'ouverture de la page.

export async function chargerLutAgm(): Promise<GrilleFeuille> {
  return chargerDonnee<GrilleFeuille>('lut__agm')
}

export async function chargerLutMdj(): Promise<GrilleFeuille> {
  return chargerDonnee<GrilleFeuille>('lut__mdj')
}

export async function chargerLutTrm(): Promise<GrilleFeuille> {
  return chargerDonnee<GrilleFeuille>('lut__trm')
}
