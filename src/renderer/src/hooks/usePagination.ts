import { useState, useEffect } from 'react'

interface UsePaginationResult<T> {
  page: number
  totalPages: number
  pagedItems: T[]
  animKey: number
  changePage: (newPage: number) => void
}

export function usePagination<T>(items: T[], pageSize: number): UsePaginationResult<T> {
  const [page, setPage] = useState(0)
  const [animKey, setAnimKey] = useState(0)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const pagedItems = items.slice(page * pageSize, (page + 1) * pageSize)

  const changePage = (newPage: number) => {
    if (newPage === page) return
    setPage(newPage)
    setAnimKey(k => k + 1)
  }

  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1))
  }, [page, totalPages])

  return { page, totalPages, pagedItems, animKey, changePage }
}
