import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkday } from './useWorkday'
import { dailyStore } from '../dailyStore'

describe('useWorkday', () => {
  beforeEach(() => localStorage.clear())

  it('初期値を dailyStore から読む', () => {
    dailyStore.setWorkStart('2026-06-10', '09:00')
    const { result } = renderHook(() => useWorkday('2026-06-10'))
    expect(result.current.workStart).toBe('09:00')
    expect(result.current.workEnd).toBeNull()
  })

  it('startWork で workStart と telework を保存する', () => {
    const { result } = renderHook(() => useWorkday('2026-06-10'))
    act(() => result.current.startWork('09:30', true))
    expect(result.current.workStart).toBe('09:30')
    expect(result.current.telework).toBe(true)
    expect(dailyStore.getWorkStart('2026-06-10')).toBe('09:30')
    expect(dailyStore.getTelework('2026-06-10')).toBe(true)
  })

  it('endWork で workEnd を保存する', () => {
    const { result } = renderHook(() => useWorkday('2026-06-10'))
    act(() => result.current.endWork('18:00'))
    expect(result.current.workEnd).toBe('18:00')
    expect(dailyStore.getWorkEnd('2026-06-10')).toBe('18:00')
  })

  it('todayKey が変わると再読込する', () => {
    dailyStore.setWorkStart('2026-06-11', '10:00')
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useWorkday(k),
      { initialProps: { k: '2026-06-10' } }
    )
    expect(result.current.workStart).toBeNull()
    rerender({ k: '2026-06-11' })
    expect(result.current.workStart).toBe('10:00')
  })
})
