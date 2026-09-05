import { isValidElement, type ReactNode } from 'react'
import type { ColonneTableau } from '../components/ui/TableauColonnes'
import { exporterCsv } from './exportCsv'

// Extraction CSV / PDF d'un tableau, quelle que soit la page (11/08/2026,
// demande explicite). Deux briques existaient déjà — `exportCsv.ts` (écrit
// pour le module EPCM) et `exportPdf.ts` (écrit pour le CRJ) — mais chaque
// page devait construire elle-même ses en-têtes et ses lignes, si bien que
// seuls 2 modules sur 15 exportaient quoi que ce soit.
//
// Le contrat d'entrée est celui que les tableaux de l'app utilisent déjà :
// une liste de colonnes `{ entete, valeur }` (components/ui/TableauColonnes).
// Une définition de colonne sert donc à la fois à afficher et à extraire —
// il n'y a pas de seconde liste à tenir à jour, et une colonne ajoutée à un
// tableau apparaît dans l'export sans rien faire.

export type ValeurExport = string | number | null

export interface ColonneExport<T> {
  entete: string
  valeur: (ligne: T) => ValeurExport
}

// Les cellules d'un tableau sont des ReactNode : le plus souvent une chaîne
// ou un nombre déjà formaté, parfois un composant (badge d'état, lien).
// Cette extraction descend dans l'arbre pour retrouver le texte affiché.
// Les composants qui portent leur libellé en prop (Badge → `label`) sont
// traités à part : ils n'ont pas d'enfants, un parcours naïf rendrait une
// cellule vide.
export function texteDepuisNoeud(noeud: ReactNode): string {
  if (noeud == null || typeof noeud === 'boolean') return ''
  if (typeof noeud === 'string' || typeof noeud === 'number') return String(noeud)
  if (Array.isArray(noeud)) return noeud.map(texteDepuisNoeud).filter(Boolean).join(' ')
  if (isValidElement(noeud)) {
    const props = noeud.props as { label?: unknown; libelle?: unknown; children?: ReactNode }
    if (typeof props.label === 'string') return props.label
    if (typeof props.libelle === 'string') return props.libelle
    return texteDepuisNoeud(props.children)
  }
  return ''
}

// Adapte les définitions d'un tableau affiché en colonnes exportables.
// Une colonne peut fournir un `texte` explicite (obligatoire pour les
// colonnes purement graphiques : barre de progression, bouton d'édition) ;
// `texte: () => null` la retire de l'extraction, ce qui est le cas voulu
// pour une colonne d'actions.
export function colonnesDepuisTableau<T>(colonnes: ColonneTableau<T>[]): ColonneExport<T>[] {
  return colonnes
    .filter((c) => c.exportable !== false)
    .map((c) => ({
      entete: texteDepuisNoeud(c.entete) || c.cle,
      valeur: (ligne: T) => (c.texte ? c.texte(ligne) : texteDepuisNoeud(c.valeur(ligne))),
    }))
}

// Un tiret cadratin en base veut dire « pas de valeur » à l'écran ; dans un
// tableur il empêcherait de trier ou de sommer la colonne. Il redevient une
// cellule vide.
function valeurBrute(v: ValeurExport): ValeurExport {
  return v === '—' ? '' : v
}

export type FormatExport = 'csv' | 'xlsx' | 'pdf'

function horodatage(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function exporterTableau<T>({
  format,
  nomFichier,
  titre,
  sousTitre,
  colonnes,
  lignes,
}: {
  format: FormatExport
  nomFichier: string
  titre: string
  sousTitre?: string
  colonnes: ColonneExport<T>[]
  lignes: T[]
}): Promise<void> {
  const entetes = colonnes.map((c) => c.entete)
  const corps = lignes.map((l) => colonnes.map((c) => valeurBrute(c.valeur(l))))
  const nom = `${nomFichier}-${horodatage()}`

  if (format === 'csv') {
    exporterCsv({ colonnes: entetes, lignes: corps, nomFichier: nom })
    return
  }

  // Vrai classeur .xlsx depuis le 20/08/2026 (lib/xlsx.ts) : le CSV reste
  // proposé — c'est lui qu'on réimporte ailleurs et qu'on ouvre dans
  // n'importe quel outil — mais il perd les types (tout y est du texte) et
  // impose à Excel un dialecte régional. Un classeur garde les nombres.
  if (format === 'xlsx') {
    const { telechargerXlsx } = await import('./xlsx')
    telechargerXlsx([{ nom: titre, lignes: [entetes, ...corps] }], nom)
    return
  }

  // jsPDF + autotable pèsent ~430 ko : chargés seulement au moment où un
  // export PDF est réellement demandé, pour ne pas les mettre dans le bundle
  // de toutes les pages qui affichent le bouton.
  const { exporterTableauPdf } = await import('./exportPdf')
  exporterTableauPdf({
    titre,
    sousTitre: sousTitre ?? `${lignes.length} ligne(s) · export du ${new Date().toLocaleDateString('fr-FR')}`,
    colonnes: entetes,
    lignes: corps.map((l) => l.map((v) => (v == null ? '' : v))),
    nomFichier: `${nom}.pdf`,
  })
}
