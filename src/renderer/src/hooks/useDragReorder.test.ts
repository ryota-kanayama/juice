import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { DragEvent } from 'react'
import { useDragReorder } from './useDragReorder'

const makeDragEvent = () =>
  ({ preventDefault: vi.fn(), dataTransfer: { effectAllowed: '', dropEffect: '' } }) as unknown as DragEvent

function setup(orderedIds: string[]) {
  const onReorder = vi.fn()
  const { result } = renderHook(() =>
    useDragReorder({ orderedIds, onReorder, page: 0, totalPages: 1, changePage: vi.fn() })
  )
  return { result, onReorder }
}

// fromId を toId の位置へドラッグして確定する
function drag(result: ReturnType<typeof setup>['result'], fromId: string, toId: string) {
  act(() => { result.current.handleDragStart(makeDragEvent(), fromId) })
  act(() => { result.current.handleDragOver(makeDragEvent(), toId) })
  act(() => { result.current.handleDrop(makeDragEvent()) })
}

describe('useDragReorder', () => {
  it('下方向ドラッグ: 対象の後ろに配置される', () => {
    const { result, onReorder } = setup(['a', 'b', 'c', 'd', 'e'])
    drag(result, 'b', 'd')
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'd', 'b', 'e'])
  })

  it('上方向ドラッグ: 対象の前に配置される', () => {
    const { result, onReorder } = setup(['a', 'b', 'c', 'd', 'e'])
    drag(result, 'e', 'b')
    expect(onReorder).toHaveBeenCalledWith(['a', 'e', 'b', 'c', 'd'])
  })

  it('隣接する要素は入れ替わる（下方向）', () => {
    const { result, onReorder } = setup(['a', 'b', 'c'])
    drag(result, 'a', 'b')
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('同じ要素へのドロップでは onReorder を呼ばない', () => {
    const { result, onReorder } = setup(['a', 'b', 'c'])
    drag(result, 'b', 'b')
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('drop と dragend の両方が来ても一度しか確定しない', () => {
    const { result, onReorder } = setup(['a', 'b', 'c'])
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a') })
    act(() => { result.current.handleDragOver(makeDragEvent(), 'c') })
    act(() => { result.current.handleDrop(makeDragEvent()) })
    act(() => { result.current.handleDragEnd() })
    expect(onReorder).toHaveBeenCalledTimes(1)
  })
})
