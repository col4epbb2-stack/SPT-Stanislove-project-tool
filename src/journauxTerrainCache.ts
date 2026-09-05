import { chargerJournalTonnage } from '../data/tonnageEchaf'
import { chargerJournalPeinture } from '../data/contratPeinture'
import { chargerAffairesMetal } from '../data/travauxMetal'
import { chargerDonnee } from './firestoreData'
import type { LigneJournalTonnage } from '../types/tonnageEchaf'
import type { LigneJournalPeinture } from '../types/contratPeinture'
import type { LigneJournalHebdo } from '../types/hebdoCrj'
import type { AffaireMetal } from '../types/travauxMetal'

// Cache mémoire process (pas de contexte React dédié) : les journaux Tonnage
// (7 911 lignes) et Peinture (2 124 lignes) sont volumineux mais statiques le
// temps d'une session — un seul fetch par onglet navigateur, réutilisé par
// toutes les fiches projet consultées (Onglet Travaux terrain, doc §3.3).
let journalTonnage: Promise<LigneJournalTonnage[]> | null = null
let journalPeinture: Promise<LigneJournalPeinture[]> | null = null
let journalHebdoCrj: Promise<LigneJournalHebdo[]> | null = null
let affairesMetal: Promise<AffaireMetal[]> | null = null

export function chargerJournalTonnagePartage(): Promise<LigneJournalTonnage[]> {
  if (!journalTonnage) journalTonnage = chargerJournalTonnage()
  return journalTonnage
}

export function chargerJournalPeinturePartage(): Promise<LigneJournalPeinture[]> {
  if (!journalPeinture) journalPeinture = chargerJournalPeinture()
  return journalPeinture
}

export function chargerJournalHebdoCrjPartage(): Promise<LigneJournalHebdo[]> {
  if (!journalHebdoCrj) journalHebdoCrj = chargerDonnee<LigneJournalHebdo[]>('hebdo-crj__journal')
  return journalHebdoCrj
}

export function chargerAffairesMetalPartage(): Promise<AffaireMetal[]> {
  if (!affairesMetal) affairesMetal = chargerAffairesMetal()
  return affairesMetal
}
