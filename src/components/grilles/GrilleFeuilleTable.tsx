import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { CelluleGrille, GrilleFeuille } from '../../types/grandArret'
import { formatCellule } from '../../lib/formatCellule'
import { BoutonExport } from '../ui/BoutonExport'
import { formatNombre } from '../../lib/format'
import { SqueletteeLignes } from '../ui/Squelette'

// Rendu générique d'une feuille Excel reprise telle quelle (grille de
// cellules typées par colonne) : recherche plein texte + pagination.
// Utilisé par les pages Grand arrêt et LUT.

const PAGE_SIZE = 20

export function Chargement() {
  return (
    <div className="carte p-5">
      <p className="text-sm text-gray-400 mb-3">Chargement des données du classeur…</p>
      <SqueletteeLignes lignes={6} />
    </div>
  )
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (p: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 text-sm">
      <button
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className="font-medium text-primary disabled:text-gray-300 disabled:cursor-not-allowed"
      >
        ← Précédent
      </button>
      <span className="text-gray-500">
        Page {page + 1} / {pageCount}
      </span>
      <button
        disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
        className="font-medium text-primary disabled:text-gray-300 disabled:cursor-not-allowed"
      >
        Suivant →
      </button>
    </div>
  )
}

export function GrilleTab({ grille, note }: { grille: GrilleFeuille; note?: string }) {
  const [recherche, setRecherche] = useState('')
  const [page, setPage] = useState(0)

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return grille.lignes
    return grille.lignes.filter((row) => row.some((v) => typeof v === 'string' && v.toLowerCase().includes(q)))
  }, [grille, recherche])

  const pageCount = Math.max(1, Math.ceil(lignes.length / PAGE_SIZE))
  const pageLignes = lignes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-4">
      {note && <p className="text-xs text-gray-400 max-w-3xl">{note}</p>}
      {grille.titre && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900">{grille.titre}</h3>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">
            {formatNombre(lignes.length)} ligne{lignes.length > 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Les feuilles reprises telles quelles sont les plus souvent
                réextraites : leurs colonnes sont déjà décrites par le
                classeur, l'export les reprend une pour une. */}
            <BoutonExport
              nomFichier={(grille.titre ?? 'feuille').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}
              titre={grille.titre ?? 'Feuille du classeur'}
              colonnes={grille.colonnes.map((c, i) => ({
                entete: c.label,
                valeur: (row: CelluleGrille[]) => formatCellule(row[i], c.format),
              }))}
              lignes={lignes}
            />
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value)
                setPage(0)
              }}
                placeholder="Rechercher…"
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                {grille.colonnes.map((c, i) => (
                  <th key={i} className="px-3 py-2 font-medium align-bottom max-w-48 whitespace-normal">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageLignes.map((row, ri) => (
                <tr key={ri} className="border-t border-gray-100">
                  {row.map((v, ci) => (
                    <td key={ci} className="px-3 py-2 max-w-96 whitespace-normal text-gray-700 align-top">
                      {formatCellule(v, grille.colonnes[ci].format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
    </div>
  )
}
