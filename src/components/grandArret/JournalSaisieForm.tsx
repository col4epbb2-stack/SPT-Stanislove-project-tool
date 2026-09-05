import { useMemo } from 'react'
import {
  Boxes,
  ClipboardList,
  Droplets,
  Flame,
  Layers3,
  PaintBucket,
  Package,
  Ruler,
  ScanSearch,
  Tag,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { FormulaireEtapes, type ChampSaisie, type EtapeChamps } from '../ui/FormulaireEtapes'
import { formatNombre, formatPercent } from '../../lib/format'
import {
  COL_JOURNAL,
  COLONNES_DERIVEES_JOURNAL,
  deriveLigneJournal,
} from '../../lib/grandArretEngine'
import type {
  CelluleGrille,
  ColonneGrille,
  JournalGrandArret,
  LigneJournalAffichee,
} from '../../types/grandArret'

// Saisie d'une ligne du Journal « Grand arrêt — suivi préfabrication »
// (07/08/2026, demande explicite : « pour la section journal je veux que tu
// appliques un formulaire comme c'est fait pour la modal suivi »). La feuille
// était en lecture seule alors qu'elle est la source des deux autres onglets
// dérivés du classeur (Dashboard, Backend).
//
// Particularité par rapport aux autres formulaires du projet : le Journal
// n'est pas une liste d'objets typés mais une grille brute de 93 colonnes
// (types/grandArret.ts) — il n'y a pas de modèle métier à décrire à la main.
// Les étapes sont donc CONSTRUITES à partir de la feuille elle-même : une
// étape par bande de colonnes du classeur (ligne 5 : ETUDES, MTO, SOUDAGE…),
// et un champ par colonne, typé par le format déjà détecté à l'import
// (texte / nombre / pourcentage / date). Ajouter une colonne au classeur
// ajoute son champ sans toucher à ce fichier.

// Une ligne en cours de saisie : les cellules indexées par leur numéro de
// colonne Excel (`c1`…`c93`), le moteur de formulaire travaillant par clé.
type ValeursJournal = Record<string, CelluleGrille>

const ICONES_GROUPE: Record<string, LucideIcon> = {
  ETUDES: ClipboardList,
  MTO: Boxes,
  'FOURNITURES MATERIEL': Package,
  OUVRAGE: Layers3,
  STR: Ruler,
  PVV: Ruler,
  'PREPARATION ASSEMBLAGE': Wrench,
  SOUDAGE: Flame,
  CND: ScanSearch,
  'EPREUVE HYDRAULIQUE': Droplets,
  PEINTURE: PaintBucket,
}

// Nombre de valeurs distinctes au-delà duquel une colonne texte n'est plus
// proposée en liste suggérée : une datalist de 150 entrées (les n° d'ISO, par
// exemple) n'aide pas, elle ralentit la frappe.
const MAX_SUGGESTIONS = 40

const DERIVEES = new Map(COLONNES_DERIVEES_JOURNAL.map((d) => [d.col, d]))

function cleColonne(col: number): string {
  return `c${col}`
}

function valeursDepuisCellules(cellules: CelluleGrille[], nbColonnes: number): ValeursJournal {
  const valeurs: ValeursJournal = {}
  for (let col = 1; col <= nbColonnes; col++) valeurs[cleColonne(col)] = cellules[col - 1] ?? null
  return valeurs
}

function cellulesDepuisValeurs(valeurs: ValeursJournal, nbColonnes: number): CelluleGrille[] {
  return Array.from({ length: nbColonnes }, (_, i) => valeurs[cleColonne(i + 1)] ?? null)
}

// Les en-têtes du classeur sont dédoublonnés par un suffixe numérique
// ("Date début22", "Avancement prévisionnel3") : illisible dans un
// formulaire. Le suffixe n'est retiré que s'il est collé au mot, pour ne pas
// amputer les libellés où le chiffre porte du sens ("SOUDEUR 1").
function libelleColonne(colonne: ColonneGrille): string {
  return colonne.label.replace(/\s+/g, ' ').replace(/(\S)\d+$/, '$1').trim()
}

function formatDerive(valeur: number | null, format: ColonneGrille['format']): string | number | null {
  if (valeur == null) return null
  if (format === 'percent') return formatPercent(valeur)
  return formatNombre(valeur, 2)
}

function champColonne(
  col: number,
  colonne: ColonneGrille,
  nbColonnes: number,
  suggestions: string[] | undefined
): ChampSaisie<ValeursJournal> {
  const label = libelleColonne(colonne)
  const derivee = DERIVEES.get(col)
  if (derivee) {
    return {
      type: 'derive',
      label,
      aide: derivee.aide,
      valeur: (v) => formatDerive(derivee.calcul(cellulesDepuisValeurs(v, nbColonnes), new Date()), colonne.format),
    }
  }
  const cle = cleColonne(col)
  switch (colonne.format) {
    case 'percent':
      return { type: 'pourcentage', cle, label }
    case 'number':
      return { type: 'nombre', cle, label, pas: 'any' }
    case 'date':
      return { type: 'date', cle, label }
    default:
      return suggestions ? { type: 'texte', cle, label, suggestions } : { type: 'texte', cle, label }
  }
}

export function JournalSaisieForm({
  isOpen,
  onClose,
  journal,
  lignes,
  ligneInitiale,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  journal: JournalGrandArret
  // Toutes les lignes affichées (importées + saisies) : alimentent les
  // listes suggérées des colonnes texte.
  lignes: CelluleGrille[][]
  ligneInitiale: LigneJournalAffichee | null
  onSubmit: (cellules: CelluleGrille[]) => Promise<void>
}) {
  const nbColonnes = journal.colonnes.length

  const suggestions = useMemo(() => {
    const parColonne = new Map<number, string[]>()
    journal.colonnes.forEach((colonne, i) => {
      if (colonne.format !== 'text') return
      const valeurs = new Set<string>()
      for (const ligne of lignes) {
        const v = ligne[i]
        if (typeof v === 'string' && v.trim() !== '') valeurs.add(v)
      }
      if (valeurs.size > 0 && valeurs.size <= MAX_SUGGESTIONS) {
        parColonne.set(i + 1, [...valeurs].sort())
      }
    })
    return parColonne
  }, [journal.colonnes, lignes])

  const etapes: EtapeChamps<ValeursJournal, string>[] = useMemo(
    () =>
      journal.groupes.map((groupe, index) => {
        const cols: number[] = []
        for (let col = groupe.debut; col <= Math.min(groupe.fin, nbColonnes); col++) {
          // Colonne que le classeur annonce lui-même comme à supprimer : pas
          // proposée à la saisie (sa valeur d'origine est conservée telle
          // quelle sur les lignes importées, cf. lib/grandArretEngine.ts).
          if (col !== COL_JOURNAL.numeroSoudureObsolete) cols.push(col)
        }
        const saisissables = cols.filter((col) => !DERIVEES.has(col))
        // La première bande du classeur porte l'identification de la ligne
        // (SCOPE / AFFAIRE / PLATEFORME / ENTREPRISE) : c'est la seule étape
        // obligatoire, tout le reste se remplit au fil de l'avancement des
        // phases et peut légitimement rester vide.
        const identification = index === 0

        return {
          key: `g${index}`,
          label: groupe.label,
          icon: identification ? Tag : (ICONES_GROUPE[groupe.label] ?? Layers3),
          optionnel: !identification,
          aide: identification
            ? "Identification de la ligne dans le classeur — le reste des bandes suit l'avancement des phases."
            : `Colonnes « ${groupe.label} » de la feuille Journal (${cols.length} colonne${cols.length > 1 ? 's' : ''}).`,
          colonnes: 2,
          champs: cols.map((col) =>
            champColonne(col, journal.colonnes[col - 1], nbColonnes, suggestions.get(col))
          ),
          etat: (v) => {
            const remplies = saisissables.filter((col) => {
              const valeur = v[cleColonne(col)]
              return valeur != null && valeur !== ''
            }).length
            if (identification) {
              const scope = v[cleColonne(COL_JOURNAL.scope)]
              const affaire = v[cleColonne(COL_JOURNAL.affaire)]
              if (scope && affaire) return { etat: 'complet', resume: `${scope} · ${affaire}` }
              return {
                etat: scope || affaire ? 'partiel' : 'vide',
                resume: 'Scope et affaire',
              }
            }
            return remplies === 0
              ? { etat: 'vide', resume: `${saisissables.length} colonnes` }
              : { etat: 'complet', resume: `${remplies} / ${saisissables.length} renseignées` }
          },
        }
      }),
    [journal.groupes, journal.colonnes, nbColonnes, suggestions]
  )

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={ligneInitiale ? 'Modifier la ligne du Journal' : 'Nouvelle ligne du Journal'}
      libelleSubmit="Enregistrer la ligne"
      cleEdition={
        ligneInitiale ? (ligneInitiale.docId ?? `import-${ligneInitiale.origineIndex}`) : 'nouveau'
      }
      valeurInitiale={() => valeursDepuisCellules(ligneInitiale?.cellules ?? [], nbColonnes)}
      etapes={etapes}
      // Les colonnes calculées sont recalculées à l'enregistrement, à partir
      // des colonnes saisies : ce qui est affiché en dérivé pendant la saisie
      // est exactement ce qui part en base.
      onSubmit={(valeurs) => onSubmit(deriveLigneJournal(cellulesDepuisValeurs(valeurs, nbColonnes)))}
    />
  )
}
