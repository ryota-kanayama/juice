import { useRef, useState, type DragEvent, type RefObject } from 'react'
import { dailyStore } from '../dailyStore'

interface Params {
  /** 現在の表示順のセッションID配列 */
  orderedIds: string[]
  /** "YYYY-MM-DD"（順序の保存キー） */
  todayKey: string
  /** 並び替え確定時に新しい順序を通知する（customOrder の更新） */
  onReorder: (order: string[]) => void
  page: number
  totalPages: number
  changePage: (page: number) => void
}

interface DragReorder {
  dragOverId: string | null
  listRef: RefObject<HTMLUListElement | null>
  handleDragStart: (e: DragEvent, sessionId: string) => void
  handleDragOver: (e: DragEvent, sessionId: string) => void
  handleListDragOver: (e: DragEvent) => void
  handleDragLeave: () => void
  handleDrop: (e: DragEvent) => void
  handleDragEnd: () => void
}

/**
 * セッションリストのドラッグ&ドロップ並び替え。
 * ページをまたぐドラッグ（端部ホールドでページ切替）と、
 * ドラッグ元がアンマウントされる場合でも drop / dragend のどちらか一度で確定する処理を扱う。
 */
export function useDragReorder({ orderedIds, todayKey, onReorder, page, totalPages, changePage }: Params): DragReorder {
  const dragItemRef = useRef<string | null>(null)
  const dragOverItemRef = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const pageChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDragStart = (e: DragEvent, sessionId: string): void => {
    dragItemRef.current = sessionId
    // 既定の copy 効果（緑のプラスマーク）を出さず移動として扱う
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: DragEvent, sessionId: string): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverItemRef.current = sessionId
    setDragOverId(sessionId)
  }

  // ドラッグ中にリスト上端/下端付近でページ切り替え
  const handleListDragOver = (e: DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!listRef.current || totalPages <= 1 || !dragItemRef.current) return

    const rect = listRef.current.getBoundingClientRect()
    const x = e.clientX
    const edgeZone = 40 // px

    const nearLeft = x - rect.left < edgeZone && page > 0
    const nearRight = rect.right - x < edgeZone && page < totalPages - 1

    if (nearLeft || nearRight) {
      if (!pageChangeTimerRef.current) {
        pageChangeTimerRef.current = setTimeout(() => {
          pageChangeTimerRef.current = null
          if (nearLeft) changePage(page - 1)
          else if (nearRight) changePage(page + 1)
        }, 400)
      }
    } else {
      if (pageChangeTimerRef.current) {
        clearTimeout(pageChangeTimerRef.current)
        pageChangeTimerRef.current = null
      }
    }
  }

  // 並び替えを確定して D&D の状態をリセットする（drop と dragend のどちらが先でも一度だけ実行される）
  const commitReorder = (): void => {
    if (pageChangeTimerRef.current) {
      clearTimeout(pageChangeTimerRef.current)
      pageChangeTimerRef.current = null
    }

    const fromId = dragItemRef.current
    const toId = dragOverItemRef.current
    dragItemRef.current = null
    dragOverItemRef.current = null
    setDragOverId(null)

    if (!fromId || !toId || fromId === toId) return

    const currentOrder = [...orderedIds]
    const fromIdx = currentOrder.indexOf(fromId)
    const toIdx = currentOrder.indexOf(toId)
    if (fromIdx === -1 || toIdx === -1) return

    currentOrder.splice(fromIdx, 1)
    currentOrder.splice(toIdx, 0, fromId)

    dailyStore.setSessionOrder(todayKey, currentOrder)
    onReorder(currentOrder)
  }

  // ページをまたぐ並び替えではドラッグ元の要素がアンマウントされ dragend が React に届かないため、
  // ドロップ先（マウントされている側）で発火する drop で確定する
  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    commitReorder()
  }

  // 同一ページ内では drop の後に dragend も届くが、refs は消費済みなので二重確定しない
  const handleDragEnd = (): void => commitReorder()

  const handleDragLeave = (): void => setDragOverId(null)

  return {
    dragOverId, listRef,
    handleDragStart, handleDragOver, handleListDragOver, handleDragLeave, handleDrop, handleDragEnd,
  }
}
