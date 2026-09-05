import { chargerDonnee, chargerJournal } from '../lib/firestoreData'
import type { LigneJournalPeinture, PeintureDashboard, PeintureReferentiel } from '../types/contratPeinture'

// Données réelles extraites du classeur « Reporting CONTRAT PEINTURE__version
// finale_Mai ». Servies directement par Firestore (blob pour le référentiel
// DATA et le tableau de bord figé, collection pour le JOURNAL — 2 124 lignes).

export async function chargerPeintureReferentiel(): Promise<PeintureReferentiel> {
  return chargerDonnee<PeintureReferentiel>('contrat-peinture__referentiel')
}

export async function chargerPeintureDashboard(): Promise<PeintureDashboard> {
  return chargerDonnee<PeintureDashboard>('contrat-peinture__dashboard')
}

export async function chargerJournalPeinture(): Promise<LigneJournalPeinture[]> {
  return chargerJournal<LigneJournalPeinture>('peinture')
}
