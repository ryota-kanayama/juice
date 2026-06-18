import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkday } from './useWorkday'

const mockSetDay = vi.fn()
const mockGetDay = vi.fn()
const mockEnsureMonth = vi.fn()
vi.mock('../daily/DailyDataContext', () => ({
  useDailyData: () => ({
    getDay: mockGetDay,
    setDay: mockSetDay,
    ensureMonth: mockEnsureMonth,
  }),
}))

beforeEach(() => { vi.clearAllMocks() })

describe('useWorkday', () => {
  it('startBreak が { breakStart, breakEnd: null } で setDay する', () => {
    mockGetDay.mockReturnValue({ workStart: '09:00' })
    const { result } = renderHook(() => useWorkday('2026-06-18'))
    act(() => { result.current.startBreak('12:00') })
    expect(mockSetDay).toHaveBeenCalledWith('2026-06-18', { breakStart: '12:00', breakEnd: null })
  })

  it('endBreak が { breakEnd } で setDay する', () => {
    mockGetDay.mockReturnValue({ workStart: '09:00', breakStart: '12:00' })
    const { result } = renderHook(() => useWorkday('2026-06-18'))
    act(() => { result.current.endBreak('13:00') })
    expect(mockSetDay).toHaveBeenCalledWith('2026-06-18', { breakEnd: '13:00' })
  })

  it('DayRecord から breakStart/breakEnd を返す', () => {
    mockGetDay.mockReturnValue({ workStart: '09:00', breakStart: '12:00', breakEnd: '13:00' })
    const { result } = renderHook(() => useWorkday('2026-06-18'))
    expect(result.current.breakStart).toBe('12:00')
    expect(result.current.breakEnd).toBe('13:00')
  })

  it('DayRecord がなければ breakStart/breakEnd は null', () => {
    mockGetDay.mockReturnValue(undefined)
    const { result } = renderHook(() => useWorkday('2026-06-18'))
    expect(result.current.breakStart).toBeNull()
    expect(result.current.breakEnd).toBeNull()
  })
})
