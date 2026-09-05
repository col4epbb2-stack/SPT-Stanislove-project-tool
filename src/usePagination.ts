import { useMemo, useState } from 'react'

export interface Pagination<T> {
  page: number
  pageCount: number
  visible: T[]
  setPage: (page: number) => void
  resetPage: () => void
}

export function usePagination<T>(items: T[], pageSize = 12): Pagination<T> {
  const [page, setPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = useMemo(
    () => items.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [items, currentPage, pageSize]
  )

  return { page: currentPage, pageCount, visible, setPage, resetPage: () => setPage(0) }
}
