import { moisDe, nomComplet } from './contratEpcmEngine'
import type { EmployeEpcm, PointageJourEpcm } from '../types/contratEpcm'

// Import de pointages (§5 : « le pointage pourra être saisi manuellement ou
// importé »). Format attendu, une ligne par employé et par jour :
//
//   date;employe;heures;heures_sup;retard_min;absent;commentaire
//   2026-08-03;Jean Dupont;10;2;0;non;
//
// Le séparateur peut être « ; » ou « , » (les deux sortent d'Excel selon la
// locale), la date être ISO ou JJ/MM/AAAA, et l'en-tête est facultatif.
//
// Aucune ligne n'est devinée : un employé qui ne correspond à personne de
// l'annuaire est rejeté avec son motif plutôt que rattaché au plus proche —
// un pointage collé au mauvais employé fausse ses coûts sans laisser de trace
// visible.

export interface LotPointageImport {
  employeId: string
  mois: string
  libelleEmploye: string
  jours: Record<string, PointageJourEpcm>
}

export interface ResultatImportPointage {
  lots: LotPointageImport[]
  nbJours: number
  rejets: { ligne: number; contenu: string; motif: string }[]
}

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/
const RE_FR = /^(\d{2})\/(\d{2})\/(\d{4})$/

function normaliserDate(valeur: string): string | null {
  const brut = valeur.trim()
  if (RE_ISO.test(brut)) return brut
  const fr = RE_FR.exec(brut)
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : null
}

function nombre(valeur: string | undefined): number | null {
  if (!valeur || valeur.trim() === '') return null
  // Les décimales sortent d'Excel avec une virgule en locale française.
  const n = Number(valeur.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function estVrai(valeur: string | undefined): boolean {
  const v = (valeur ?? '').trim().toLowerCase()
  return v === 'oui' || v === 'o' || v === 'true' || v === '1' || v === 'x'
}

/** Comparaison de noms tolérante : casse, accents et ordre nom/prénom. */
function clesNom(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

export function analyserCsvPointage(contenu: string, employes: EmployeEpcm[]): ResultatImportPointage {
  const parNom = new Map(employes.map((e) => [clesNom(nomComplet(e)), e]))
  const lots = new Map<string, LotPointageImport>()
  const rejets: ResultatImportPointage['rejets'] = []
  let nbJours = 0

  const lignes = contenu.split(/\r?\n/)
  lignes.forEach((brut, index) => {
    const ligne = brut.trim()
    if (!ligne) return
    const colonnes = ligne.split(ligne.includes(';') ? ';' : ',')
    const date = normaliserDate(colonnes[0] ?? '')
    if (!date) {
      // Première ligne non datée = en-tête, silencieusement ignorée.
      if (index === 0) return
      rejets.push({ ligne: index + 1, contenu: ligne, motif: 'Date illisible (attendu AAAA-MM-JJ ou JJ/MM/AAAA)' })
      return
    }
    const nom = (colonnes[1] ?? '').trim()
    const employe = parNom.get(clesNom(nom))
    if (!employe) {
      rejets.push({ ligne: index + 1, contenu: ligne, motif: `Aucun employé nommé « ${nom} »` })
      return
    }

    const mois = moisDe(date)
    const cle = `${employe.id}|${mois}`
    const lot = lots.get(cle) ?? { employeId: employe.id, mois, libelleEmploye: nomComplet(employe), jours: {} }
    lot.jours[date] = {
      // La colonne reste celle du format documenté (des heures) : les fichiers
      // déjà préparés continuent de s'importer. Elle est relue en jours par
      // `joursPointes()`, à raison de 12 h pour une journée — comme les
      // pointages saisis avant le rev01.
      jours: null,
      heuresTravaillees: nombre(colonnes[2]),
      heuresSupplementaires: nombre(colonnes[3]),
      retardMinutes: nombre(colonnes[4]),
      absent: estVrai(colonnes[5]),
      commentaire: (colonnes[6] ?? '').trim() || null,
    }
    lots.set(cle, lot)
    nbJours++
  })

  return { lots: [...lots.values()], nbJours, rejets }
}

export const MODELE_CSV_POINTAGE = [
  'date;employe;heures;heures_sup;retard_min;absent;commentaire',
  '2026-08-03;Jean Dupont;10;2;0;non;',
  '2026-08-04;Jean Dupont;;;;oui;Absence maladie',
].join('\n')
