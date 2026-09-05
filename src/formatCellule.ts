import type { CelluleGrille, ColonneGrille } from '../types/grandArret'
import { formatDate, formatNombre, formatPercent } from './format'

// Rendu d'une cellule d'une feuille Excel reprise telle quelle, typée par le
// format détecté sur sa colonne. Sortie de components/grilles/
// GrilleFeuilleTable.tsx, qui exportait à la fois cette fonction et des
// composants — ce que le Fast Refresh de Vite ne supporte pas (règle eslint
// react-refresh/only-export-components), comme components/ui/tonsKpi.ts.
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/

export function formatCellule(v: CelluleGrille, format: ColonneGrille['format']): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'number') {
    if (format === 'percent') return formatPercent(v)
    return formatNombre(v, 2)
  }
  if (format === 'date' && RE_ISO.test(v)) return formatDate(v)
  return v
}
