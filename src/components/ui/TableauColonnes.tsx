import type { ReactNode } from 'react'
import { BoutonExport } from './BoutonExport'
import { colonnesDepuisTableau } from '../../lib/export'

// Tableau piloté par une liste de colonnes plutôt que par du JSX écrit deux
// fois (un mur de <th>, puis un mur de <td> qu'il faut garder dans le même
// ordre). Le Journal montage/dépose a 48 colonnes, SUIVI DES ACTIVITES 53 :
// à ce volume, l'écriture manuelle des deux moitiés a déjà produit des
// décalages en-tête/valeur, et ajouter une colonne demandait deux éditions
// au même index. Ici une colonne = un objet { entete, valeur }, et l'ordre
// d'affichage est celui du tableau de définitions.
//
// Les définitions de colonnes vivent à côté du type qu'elles décrivent
// (components/tonnage/colonnes.tsx) — elles sont ainsi la traduction directe
// et unique des colonnes de la feuille Excel d'origine.

export interface ColonneTableau<T> {
  // Clé stable (utilisée comme key React) — pas forcément un champ du type,
  // beaucoup de colonnes des classeurs sont des colonnes calculées.
  cle: string
  entete: ReactNode
  valeur: (ligne: T) => ReactNode
  align?: 'left' | 'right'
  // Classe supplémentaire appliquée à la cellule (largeur max, troncature…).
  classeCellule?: string
  // Classe calculée par ligne (mise en évidence conditionnelle, ex. retard).
  classeLigne?: (ligne: T) => string
  // Infobulle de la cellule (texte intégral d'une colonne tronquée).
  titre?: (ligne: T) => string | undefined
  // Valeur pour l'extraction CSV/PDF quand la cellule affichée n'est pas du
  // texte (barre de progression, badge composite…). Sans elle, le texte est
  // retrouvé dans le rendu (lib/export.ts).
  texte?: (ligne: T) => string | number | null
  // `false` retire la colonne des extractions — pour une colonne d'actions,
  // qui n'a aucun sens dans un fichier.
  exportable?: boolean
}

/**
 * Bandeau d'en-tête au-dessus des colonnes — une feuille Excel groupe souvent
 * ses colonnes sous un intitulé commun (« Cumulative % » sur 4 colonnes,
 * « Monthly effort % » sur 3, dans la feuille Progress_Curve). La somme des
 * `span` doit couvrir toutes les colonnes ; un groupe sans libellé sert de
 * blanc au-dessus du bloc d'identification.
 */
export interface GroupeColonnes {
  label?: ReactNode
  span: number
}

export function TableauColonnes<T>({
  colonnes,
  groupes,
  lignes,
  cleLigne,
  messageVide = 'Aucune ligne ne correspond aux filtres.',
  exportation,
}: {
  colonnes: ColonneTableau<T>[]
  groupes?: GroupeColonnes[]
  lignes: T[]
  cleLigne: (ligne: T) => string | number
  messageVide?: string
  // Active le bouton d'extraction CSV/PDF au-dessus du tableau. Branché ici
  // plutôt que dans chaque onglet : les 16 tableaux de modules passent par ce
  // composant, ils en héritent tous en passant un nom de fichier.
  exportation?: {
    nomFichier: string
    titre: string
    sousTitre?: string
    // L'ensemble à extraire. Par défaut les lignes affichées — mais un
    // tableau paginé reçoit ici sa page courante : il doit passer son
    // ensemble filtré, sinon on exporterait une page sur N sans le dire.
    lignes?: T[]
  }
}) {
  return (
    <div className="overflow-x-auto">
      {exportation && (
        <div className="flex justify-end px-3 pb-2">
          <BoutonExport
            nomFichier={exportation.nomFichier}
            titre={exportation.titre}
            sousTitre={exportation.sousTitre}
            colonnes={colonnesDepuisTableau(colonnes)}
            lignes={exportation.lignes ?? lignes}
          />
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          {groupes && (
            <tr className="text-center text-gray-500">
              {groupes.map((g, i) => (
                <th
                  key={i}
                  colSpan={g.span}
                  className={`px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide ${
                    g.label ? 'border-b border-gray-200' : ''
                  }`}
                >
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr className="border-b border-gray-200 text-left text-gray-500">
            {colonnes.map((c) => (
              <th
                key={c.cle}
                className={`px-3 py-2 font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.entete}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lignes.map((l) => (
            <tr key={cleLigne(l)}>
              {colonnes.map((c) => (
                <td
                  key={c.cle}
                  title={c.titre?.(l)}
                  className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} ${
                    c.classeCellule ?? 'whitespace-nowrap'
                  } ${c.classeLigne?.(l) ?? ''}`}
                >
                  {c.valeur(l)}
                </td>
              ))}
            </tr>
          ))}
          {lignes.length === 0 && (
            <tr>
              <td colSpan={colonnes.length} className="px-5 py-8 text-center text-gray-400">
                {messageVide}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
