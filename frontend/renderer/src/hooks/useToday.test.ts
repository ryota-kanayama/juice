// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToday } from './useToday'

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('useToday', () => {
  it('今日の日付を YYYY-MM-DD で返す', () => {
    vi.setSystemTime(new Date(2026, 5, 3, 12, 0, 0))

    const { result } = renderHook(() => useToday())

    expect(result.current).toBe('2026-06-03')
  })

  it('深夜0時を過ぎると日付を更新する', () => {
    vi.setSystemTime(new Date(2026, 5, 13, 23, 59, 50))
    const { result } = renderHook(() => useToday())

    act(() => { vi.advanceTimersByTime(11_000) }) // 翌日 00:00:01 まで

    expect(result.current).toBe('2026-06-14')
  })

  it('0時を過ぎる前は日付を変えない', () => {
    vi.setSystemTime(new Date(2026, 5, 13, 23, 59, 50))
    const { result } = renderHook(() => useToday())

    act(() => { vi.advanceTimersByTime(9_000) })

    expect(result.current).toBe('2026-06-13')
  })

  it('次の日の0時にも続けて更新する', () => {
    vi.setSystemTime(new Date(2026, 5, 13, 23, 59, 50))
    const { result } = renderHook(() => useToday())
    act(() => { vi.advanceTimersByTime(11_000) })

    act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000) })

    expect(result.current).toBe('2026-06-15')
  })

  it('ウィンドウにフォーカスが戻ったときに日付を確かめ直す', () => {
    // スリープ明けなどでタイマーが遅れた状況
    vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0))
    const { result } = renderHook(() => useToday())
    vi.setSystemTime(new Date(2026, 5, 14, 9, 0, 0))

    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(result.current).toBe('2026-06-14')
  })

  it('画面が表示されたときに日付を確かめ直す', () => {
    vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0))
    const { result } = renderHook(() => useToday())
    vi.setSystemTime(new Date(2026, 5, 14, 9, 0, 0))

    act(() => { setHidden(false) })

    expect(result.current).toBe('2026-06-14')
  })

  it('画面が隠れたときは確かめ直さない', () => {
    vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0))
    const { result } = renderHook(() => useToday())
    vi.setSystemTime(new Date(2026, 5, 14, 9, 0, 0))

    act(() => { setHidden(true) })

    expect(result.current).toBe('2026-06-13')
  })

  it('アンマウント後は0時を過ぎてもタイマーを残さない', () => {
    vi.setSystemTime(new Date(2026, 5, 13, 23, 59, 50))
    const { unmount } = renderHook(() => useToday())

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
