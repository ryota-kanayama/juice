// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToday } from './useToday'

describe('useToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('初期値は今日の日付（YYYY-MM-DD）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-06-13')
  })

  it('深夜0時を跨ぐとタイマーで日付が更新される', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 13, 23, 59, 50))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-06-13')
    // 翌日 00:00:01 のタイマー発火まで進める
    act(() => { vi.advanceTimersByTime(13 * 1000) })
    expect(result.current).toBe('2026-06-14')
  })

  it('focus 復帰時に日付を再評価する', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-06-13')
    // ポップオーバーを開いたまま日付が変わった状況を再現
    vi.setSystemTime(new Date(2026, 5, 14, 9, 0, 0))
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toBe('2026-06-14')
  })
})
