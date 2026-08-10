// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DailyDataProvider, useDailyData } from './DailyDataContext'

let dailyChangedCb: ((p: { yearMonth: string }) => void) | null = null
const mockGetMonth = vi.fn()
const mockSetDay = vi.fn().mockResolvedValue(undefined)
const mockOnChanged = vi.fn((cb: (p: { yearMonth: string }) => void) => {
  dailyChangedCb = cb
  return () => { dailyChangedCb = null }
})

vi.mock('../repositories/dailyRepository', () => ({
  dailyRepository: {
    getMonth: (ym: string) => mockGetMonth(ym),
    setDay: (date: string, patch: unknown) => mockSetDay(date, patch),
    onChanged: (cb: (p: { yearMonth: string }) => void) => mockOnChanged(cb),
  },
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <DailyDataProvider>{children}</DailyDataProvider>
)

beforeEach(() => {
  vi.clearAllMocks()
  dailyChangedCb = null
  mockSetDay.mockResolvedValue(undefined)
})

describe('DailyDataProvider', () => {
  it('初回ロードでは手元の楽観更新が勝つ', async () => {
    // 先に楽観更新してから、古い内容を返すロードが解決する
    let resolveMonth: (v: { version: number; days: Record<string, unknown> }) => void = () => {}
    mockGetMonth.mockReturnValue(new Promise(r => { resolveMonth = r }))

    const { result } = renderHook(() => useDailyData(), { wrapper })
    act(() => { result.current.ensureMonth('2026-08') })
    await act(async () => { await result.current.setDay('2026-08-09', { workStart: '09:00' }) })

    await act(async () => {
      resolveMonth({ version: 1, days: { '2026-08-09': { workStart: '古い値' } } })
    })

    expect(result.current.getDay('2026-08-09')?.workStart).toBe('09:00')
  })

  it('変更通知の読み直しではディスクが勝つ', async () => {
    mockGetMonth.mockResolvedValue({ version: 1, days: { '2026-08-09': { workStart: '09:00' } } })
    const { result } = renderHook(() => useDailyData(), { wrapper })
    act(() => { result.current.ensureMonth('2026-08') })
    await waitFor(() => expect(result.current.getDay('2026-08-09')?.workStart).toBe('09:00'))

    // 他のウィンドウが書き換えた
    mockGetMonth.mockResolvedValue({ version: 1, days: { '2026-08-09': { workStart: '10:30' } } })
    await act(async () => { dailyChangedCb!({ yearMonth: '2026-08' }) })

    await waitFor(() => expect(result.current.getDay('2026-08-09')?.workStart).toBe('10:30'))
  })

  it('読み込んでいない年月の通知は無視する', async () => {
    mockGetMonth.mockResolvedValue({ version: 1, days: {} })
    const { result } = renderHook(() => useDailyData(), { wrapper })
    act(() => { result.current.ensureMonth('2026-08') })
    await waitFor(() => expect(mockGetMonth).toHaveBeenCalledTimes(1))

    await act(async () => { dailyChangedCb!({ yearMonth: '2020-01' }) })

    expect(mockGetMonth).toHaveBeenCalledTimes(1)
  })

  it('読み直しても同じ月を二重にロード済み扱いしない', async () => {
    mockGetMonth.mockResolvedValue({ version: 1, days: {} })
    const { result } = renderHook(() => useDailyData(), { wrapper })
    act(() => { result.current.ensureMonth('2026-08') })
    await waitFor(() => expect(mockGetMonth).toHaveBeenCalledTimes(1))

    await act(async () => { dailyChangedCb!({ yearMonth: '2026-08' }) })
    await waitFor(() => expect(mockGetMonth).toHaveBeenCalledTimes(2))

    // 読み直しのあとも ensureMonth は再ロードしない（loadedRef が保たれている）
    act(() => { result.current.ensureMonth('2026-08') })
    expect(mockGetMonth).toHaveBeenCalledTimes(2)
  })
})
