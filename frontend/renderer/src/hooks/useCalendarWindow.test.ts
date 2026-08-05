import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCalendarWindow } from './useCalendarWindow'
import type { Session } from '../types/session'

const mockList = vi.fn()
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockHolidays = vi.fn()

vi.mock('../repositories/sessionRepository', () => ({
  sessionRepository: {
    list: (ym: string) => mockList(ym),
    update: (s: Session) => mockUpdate(s),
  },
}))
vi.mock('../repositories/holidayRepository', () => ({
  holidayRepository: { getAll: () => mockHolidays() },
}))

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1', taskId: 's1', name: '作業', projectCode: 'P', workCategory: 'C',
    times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T11:00:00' }],
    date: '2026-08-06', color: '#FF9500', totalTime: 60,
    ...overrides,
  }
}

describe('useCalendarWindow', () => {
  beforeEach(() => {
    // Date だけ偽造。setTimeout/setInterval は実タイマーのまま残し、waitFor のポーリングを機能させる。
    vi.useFakeTimers({ toFake: ['Date'] })
    // 2026-08-06（水）に固定
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0))
    mockList.mockReset().mockResolvedValue([])
    mockHolidays.mockReset().mockResolvedValue({})
    mockUpdate.mockClear()
  })

  it('初期状態は週表示・今日が基準日かつ選択日', () => {
    const { result } = renderHook(() => useCalendarWindow())
    expect(result.current.view).toBe('week')
    expect(result.current.anchorDate).toBe('2026-08-06')
    expect(result.current.selectedDate).toBe('2026-08-06')
  })

  it('週表示の visibleDates は日曜始まりの7日', () => {
    const { result } = renderHook(() => useCalendarWindow())
    expect(result.current.visibleDates).toEqual([
      '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08',
    ])
  })

  it('月表示に切り替えると visibleDates がその月の全日になる', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.setView('month') })
    expect(result.current.visibleDates).toHaveLength(31)
    expect(result.current.visibleDates[0]).toBe('2026-08-01')
    expect(result.current.visibleDates[30]).toBe('2026-08-31')
  })

  it('週表示の goNext は7日進む', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.goNext() })
    expect(result.current.anchorDate).toBe('2026-08-13')
  })

  it('週表示の goPrev は7日戻る', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.goPrev() })
    expect(result.current.anchorDate).toBe('2026-07-30')
  })

  it('月表示の goNext は翌月へ移る', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.setView('month') })
    act(() => { result.current.goNext() })
    expect(result.current.anchorDate.slice(0, 7)).toBe('2026-09')
  })

  it('月表示の goPrev は前月へ移る', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.setView('month') })
    act(() => { result.current.goPrev() })
    expect(result.current.anchorDate.slice(0, 7)).toBe('2026-07')
  })

  it('goToday で今日に戻る', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.goNext() })
    act(() => { result.current.goToday() })
    expect(result.current.anchorDate).toBe('2026-08-06')
    expect(result.current.selectedDate).toBe('2026-08-06')
  })

  it('goNextMonth は週表示中でも翌月へ移る', () => {
    const { result } = renderHook(() => useCalendarWindow())
    expect(result.current.view).toBe('week')
    act(() => { result.current.goNextMonth() })
    expect(result.current.anchorDate.slice(0, 7)).toBe('2026-09')
  })

  it('goPrevMonth は週表示中でも前月へ移る', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.goPrevMonth() })
    expect(result.current.anchorDate.slice(0, 7)).toBe('2026-07')
  })

  it('selectDate は選択日だけ変え、表示範囲は動かさない', () => {
    const { result } = renderHook(() => useCalendarWindow())
    act(() => { result.current.selectDate('2026-08-04') })
    expect(result.current.selectedDate).toBe('2026-08-04')
    expect(result.current.anchorDate).toBe('2026-08-06')
  })

  it('表示範囲に含まれる月のセッションを日付ごとにまとめる', async () => {
    mockList.mockResolvedValue([makeSession(), makeSession({ id: 's2', date: '2026-08-04' })])
    const { result } = renderHook(() => useCalendarWindow())
    await waitFor(() => {
      expect(result.current.sessionsByDate['2026-08-06']).toHaveLength(1)
    })
    expect(result.current.sessionsByDate['2026-08-04']).toHaveLength(1)
  })

  it('月をまたぐ週では両方の月を読み込む', async () => {
    const { result } = renderHook(() => useCalendarWindow())
    await waitFor(() => { expect(mockList).toHaveBeenCalled() })
    mockList.mockClear()
    // 8/6 の週 → 4回 goNext で 2026-09-03 が anchor（週は 8/30(日)〜9/5(土)）
    act(() => { result.current.goNext() })
    act(() => { result.current.goNext() })
    act(() => { result.current.goNext() })
    act(() => { result.current.goNext() })
    expect(result.current.visibleDates[0]).toBe('2026-08-30')
    expect(result.current.visibleDates[6]).toBe('2026-09-05')
    await waitFor(() => {
      const requested = mockList.mock.calls.map(c => c[0])
      expect(requested).toContain('2026-08')
      expect(requested).toContain('2026-09')
    })
  })

  it('updateSession は保存してローカル state も更新する', async () => {
    mockList.mockResolvedValue([makeSession()])
    const { result } = renderHook(() => useCalendarWindow())
    await waitFor(() => {
      expect(result.current.sessionsByDate['2026-08-06']).toHaveLength(1)
    })
    const edited = { ...makeSession(), name: '編集後' }
    await act(async () => { await result.current.updateSession(edited) })
    expect(mockUpdate).toHaveBeenCalledWith(edited)
    expect(result.current.sessionsByDate['2026-08-06'][0].name).toBe('編集後')
  })

  it('祝日を取得して保持する', async () => {
    mockHolidays.mockResolvedValue({ '2026-08-11': '山の日' })
    const { result } = renderHook(() => useCalendarWindow())
    await waitFor(() => {
      expect(result.current.holidays['2026-08-11']).toBe('山の日')
    })
  })
})
