import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import type { DragEvent } from 'react'
import { useDragReorder } from './useDragReorder'

type DragReorder = ReturnType<typeof useDragReorder>
type Hook = RenderHookResult<DragReorder, unknown>['result']

function dragEvent(clientX = 0): DragEvent & { dataTransfer: { effectAllowed: string; dropEffect: string; setData: ReturnType<typeof vi.fn> } } {
  return {
    clientX,
    preventDefault: vi.fn(),
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
  } as never
}

function setup(orderedIds: string[], paging: { page?: number; totalPages?: number } = {}) {
  const onReorder = vi.fn()
  const changePage = vi.fn()
  const { result } = renderHook(() => useDragReorder({
    orderedIds,
    onReorder,
    page: paging.page ?? 0,
    totalPages: paging.totalPages ?? 1,
    changePage,
  }))
  return { result, onReorder, changePage }
}

/** fromId を掴んで toId の上へ運ぶ（まだ確定しない） */
function dragOnto(result: Hook, fromId: string, toId: string): void {
  act(() => { result.current.handleDragStart(dragEvent(), fromId) })
  act(() => { result.current.handleDragOver(dragEvent(), toId) })
}

function drop(result: Hook): void {
  act(() => { result.current.handleDrop(dragEvent()) })
}

describe('useDragReorder', () => {
  describe('並び替えの確定', () => {
    it('下方向へ運ぶと、対象の後ろに入る', () => {
      const { result, onReorder } = setup(['a', 'b', 'c', 'd', 'e'])
      dragOnto(result, 'b', 'd')

      drop(result)

      expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'd', 'b', 'e'])
    })

    it('上方向へ運ぶと、対象の前に入る', () => {
      const { result, onReorder } = setup(['a', 'b', 'c', 'd', 'e'])
      dragOnto(result, 'e', 'b')

      drop(result)

      expect(onReorder).toHaveBeenCalledWith(['a', 'e', 'b', 'c', 'd'])
    })

    it('隣へ運ぶと入れ替わる', () => {
      const { result, onReorder } = setup(['a', 'b', 'c'])
      dragOnto(result, 'a', 'b')

      drop(result)

      expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
    })

    it('dragend でも確定する（ドロップ先が受け取らなかった場合）', () => {
      const { result, onReorder } = setup(['a', 'b', 'c'])
      dragOnto(result, 'a', 'c')

      act(() => { result.current.handleDragEnd() })

      expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a'])
    })

    it('drop と dragend の両方が来ても一度しか確定しない', () => {
      const { result, onReorder } = setup(['a', 'b', 'c'])
      dragOnto(result, 'a', 'c')
      drop(result)

      act(() => { result.current.handleDragEnd() })

      expect(onReorder).toHaveBeenCalledOnce()
    })

    it('同じ要素の上で離したら確定しない', () => {
      const { result, onReorder } = setup(['a', 'b', 'c'])
      dragOnto(result, 'b', 'b')

      drop(result)

      expect(onReorder).not.toHaveBeenCalled()
    })

    it('どの要素の上にも運ばずに離したら確定しない', () => {
      const { result, onReorder } = setup(['a', 'b', 'c'])
      act(() => { result.current.handleDragStart(dragEvent(), 'a') })

      drop(result)

      expect(onReorder).not.toHaveBeenCalled()
    })

    it('一覧に無い要素が絡んだら確定しない', () => {
      const { result, onReorder } = setup(['a', 'b', 'c'])
      dragOnto(result, 'a', 'zzz')

      drop(result)

      expect(onReorder).not.toHaveBeenCalled()
    })
  })

  describe('ドラッグ中の表示', () => {
    it('運んでいる先の要素を dragOverId で示す', () => {
      const { result } = setup(['a', 'b', 'c'])

      dragOnto(result, 'a', 'c')

      expect(result.current.dragOverId).toBe('c')
    })

    it('要素から外れたら dragOverId を消す', () => {
      const { result } = setup(['a', 'b', 'c'])
      dragOnto(result, 'a', 'c')

      act(() => { result.current.handleDragLeave() })

      expect(result.current.dragOverId).toBeNull()
    })

    it('確定したら dragOverId を消す', () => {
      const { result } = setup(['a', 'b', 'c'])
      dragOnto(result, 'a', 'c')

      drop(result)

      expect(result.current.dragOverId).toBeNull()
    })
  })

  describe('dragstart', () => {
    // WKWebView(WebKit) は dragstart で dataTransfer にデータを設定しないとドラッグを開始しない。
    // Chromium では不要だったため退行しやすい
    it('dataTransfer にデータを設定する（WKWebView 対応）', () => {
      const { result } = setup(['a', 'b', 'c'])
      const event = dragEvent()

      act(() => { result.current.handleDragStart(event, 'a') })

      expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'a')
    })

    it('コピーではなく移動として扱う', () => {
      const { result } = setup(['a', 'b', 'c'])
      const event = dragEvent()

      act(() => { result.current.handleDragStart(event, 'a') })

      expect(event.dataTransfer.effectAllowed).toBe('move')
    })
  })

  describe('端でのページ送り', () => {
    // 一覧は x = 100〜400。端から 40px 以内に 400ms 留まるとページを送る
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    function withList(result: Hook): void {
      result.current.listRef.current = { getBoundingClientRect: () => ({ left: 100, right: 400 }) } as HTMLUListElement
    }

    function holdAt(result: Hook, clientX: number): void {
      act(() => { result.current.handleListDragOver(dragEvent(clientX)) })
    }

    it('右端に留まると次のページへ送る', () => {
      const { result, changePage } = setup(['a', 'b'], { page: 0, totalPages: 3 })
      withList(result)
      act(() => { result.current.handleDragStart(dragEvent(), 'a') })
      holdAt(result, 390)

      act(() => { vi.advanceTimersByTime(400) })

      expect(changePage).toHaveBeenCalledWith(1)
    })

    it('左端に留まると前のページへ送る', () => {
      const { result, changePage } = setup(['a', 'b'], { page: 2, totalPages: 3 })
      withList(result)
      act(() => { result.current.handleDragStart(dragEvent(), 'a') })
      holdAt(result, 110)

      act(() => { vi.advanceTimersByTime(400) })

      expect(changePage).toHaveBeenCalledWith(1)
    })

    it('400ms 経つ前に端から離れたら送らない', () => {
      const { result, changePage } = setup(['a', 'b'], { page: 0, totalPages: 3 })
      withList(result)
      act(() => { result.current.handleDragStart(dragEvent(), 'a') })
      holdAt(result, 390)
      holdAt(result, 250)

      act(() => { vi.advanceTimersByTime(400) })

      expect(changePage).not.toHaveBeenCalled()
    })

    it('最後のページの右端では送らない', () => {
      const { result, changePage } = setup(['a', 'b'], { page: 2, totalPages: 3 })
      withList(result)
      act(() => { result.current.handleDragStart(dragEvent(), 'a') })
      holdAt(result, 390)

      act(() => { vi.advanceTimersByTime(400) })

      expect(changePage).not.toHaveBeenCalled()
    })

    it('最初のページの左端では送らない', () => {
      const { result, changePage } = setup(['a', 'b'], { page: 0, totalPages: 3 })
      withList(result)
      act(() => { result.current.handleDragStart(dragEvent(), 'a') })
      holdAt(result, 110)

      act(() => { vi.advanceTimersByTime(400) })

      expect(changePage).not.toHaveBeenCalled()
    })

    it('ドラッグしていなければ送らない', () => {
      const { result, changePage } = setup(['a', 'b'], { page: 0, totalPages: 3 })
      withList(result)
      holdAt(result, 390)

      act(() => { vi.advanceTimersByTime(400) })

      expect(changePage).not.toHaveBeenCalled()
    })

    it('確定したら予約していたページ送りを取り消す', () => {
      const { result, changePage } = setup(['a', 'b'], { page: 0, totalPages: 3 })
      withList(result)
      dragOnto(result, 'a', 'b')
      holdAt(result, 390)
      drop(result)

      act(() => { vi.advanceTimersByTime(400) })

      expect(changePage).not.toHaveBeenCalled()
    })
  })
})
