interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  total?: number
  itemLabel?: string
}

export function Pagination({ page, pageCount, onPageChange, total, itemLabel = 'lignes' }: PaginationProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 text-sm">
      <button
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        className="font-medium text-primary disabled:text-gray-300 disabled:cursor-not-allowed"
      >
        ← Précédent
      </button>
      <span className="text-gray-500">
        Page {page + 1} / {pageCount}
        {total !== undefined && ` · ${total} ${itemLabel}`}
      </span>
      <button
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(page + 1)}
        className="font-medium text-primary disabled:text-gray-300 disabled:cursor-not-allowed"
      >
        Suivant →
      </button>
    </div>
  )
}
