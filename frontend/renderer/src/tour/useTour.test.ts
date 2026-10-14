import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTour } from './useTour'
import { TOUR_STEPS } from './tourSteps'

const COMPLETED = 'juice.tourCompleted'
const LAST = TOUR_STEPS.length - 1

beforeEach(() => localStorage.clear())

function renderTour() {
  return renderHook(() => useTour()).result
}

describe('useTour', () => {
  describe('起動', () => {
    it('まだ完了していなければ最初のステップから自動で始める', () => {
      const result = renderTour()

      expect(result.current).toMatchObject({ isActive: true, index: 0, step: TOUR_STEPS[0] })
    })

    it('完了済みなら自動では始めない', () => {
      localStorage.setItem(COMPLETED, 'true')

      const result = renderTour()

      expect(result.current).toMatchObject({ isActive: false, step: null })
    })

    it('完了済みでも start で最初から始められる', () => {
      localStorage.setItem(COMPLETED, 'true')
      const result = renderTour()

      act(() => result.current.start())

      expect(result.current).toMatchObject({ isActive: true, index: 0 })
    })
  })

  describe('移動', () => {
    it('next で次のステップへ進む', () => {
      const result = renderTour()

      act(() => result.current.next())

      expect(result.current.index).toBe(1)
    })

    it('prev で前のステップへ戻る', () => {
      const result = renderTour()
      act(() => result.current.next())

      act(() => result.current.prev())

      expect(result.current.index).toBe(0)
    })

    it('最初のステップで prev しても動かない', () => {
      const result = renderTour()

      act(() => result.current.prev())

      expect(result.current.index).toBe(0)
    })

    it('最後のステップで next しても動かない', () => {
      const result = renderTour()
      for (let i = 0; i < LAST; i++) act(() => result.current.next())

      act(() => result.current.next())

      expect(result.current.index).toBe(LAST)
    })

    it('最後のステップでだけ isLast が立つ', () => {
      const result = renderTour()
      const flags: boolean[] = [result.current.isLast]

      for (let i = 0; i < LAST; i++) {
        act(() => result.current.next())
        flags.push(result.current.isLast)
      }

      expect(flags.indexOf(true)).toBe(LAST)
    })

    it('動いていないときに next しても始まらない', () => {
      localStorage.setItem(COMPLETED, 'true')
      const result = renderTour()

      act(() => result.current.next())

      expect(result.current.isActive).toBe(false)
    })
  })

  describe.each(['finish', 'skip'] as const)('%s', (method) => {
    it('ツアーを終える', () => {
      const result = renderTour()

      act(() => result.current[method]())

      expect(result.current.isActive).toBe(false)
    })

    it('完了フラグを保存する（次回は自動で始めない）', () => {
      const result = renderTour()

      act(() => result.current[method]())

      expect(localStorage.getItem(COMPLETED)).toBe('true')
    })
  })
})
