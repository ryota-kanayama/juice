import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Session } from '../types/session'

const mockList = vi.fn()
const mockUpdate = vi.fn()
const mockGetAll = vi.fn()

vi.mock('../repositories/sessionRepository', () => ({
  sessionRepository: {
    list: (ym: string) => mockList(ym),
    update: (s: Session) => mockUpdate(s),
  },
}))
vi.mock('../repositories/holidayRepository', () => ({
  holidayRepository: { getAll: () => mockGetAll() },
}))

import { useCalendar } from './useCalendar'

function makeSession(id: string, date: string): Session {
  return {
    id,
    taskId: id,
    name: `作業${id}`,
    projectCode: 'P',
    workCategory: 'C',
    times: [{ startTime: `${date}T10:00:00`, endTime: `${date}T11:00:00` }],
    date,
    color: '#FF9500',
    totalTime: 60,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
  vi.clearAllMocks()
  mockGetAll.mockResolvedValue({})
  mockUpdate.mockResolvedValue(undefined)
  mockList.mockImplementation((ym: string) =>
    Promise.resolve(
      ym === '2026-06'
        ? [makeSession('1', '2026-06-10'), makeSession('2', '2026-06-10'), makeSession('3', '2026-06-15')]
        : []
    )
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCalendar', () => {
  it('初期ロードで祝日とその月のセッションを日別にまとめる', async () => {
    mockGetAll.mockResolvedValue({ '2026-06-15': '記念日' })
    const { result } = renderHook(() => useCalendar())
    await waitFor(() => expect(result.current.sessionDates.length).toBe(2))
    expect(result.current.year).toBe(2026)
    expect(result.current.month).toBe(6)
    expect(result.current.sessionDates).toEqual(expect.arrayContaining(['2026-06-10', '2026-06-15']))
    expect(result.current.holidays).toEqual({ '2026-06-15': '記念日' })
  })

  it('selectDate でその日のセッションを返す', async () => {
    const { result } = renderHook(() => useCalendar())
    await waitFor(() => expect(result.current.sessionDates.length).toBe(2))
    act(() => result.current.selectDate('2026-06-10'))
    expect(result.current.selectedDate).toBe('2026-06-10')
    expect(result.current.selectedSessions.map(s => s.id)).toEqual(['1', '2'])
  })

  it('nextMonth / prevMonth で月が進み・戻り、選択日がリセットされる', async () => {
    const { result } = renderHook(() => useCalendar())
    await waitFor(() => expect(result.current.sessionDates.length).toBe(2))
    act(() => result.current.selectDate('2026-06-10'))
    act(() => result.current.nextMonth())
    expect(result.current.month).toBe(7)
    expect(result.current.selectedDate).toBeNull()
    act(() => result.current.prevMonth())
    expect(result.current.month).toBe(6)
  })

  it('1月で prevMonth すると前年の12月になる', async () => {
    vi.setSystemTime(new Date('2026-01-10T12:00:00'))
    const { result } = renderHook(() => useCalendar())
    await waitFor(() => expect(result.current.month).toBe(1))
    act(() => result.current.prevMonth())
    expect(result.current.year).toBe(2025)
    expect(result.current.month).toBe(12)
  })

  it('12月で nextMonth すると翌年の1月になる', async () => {
    vi.setSystemTime(new Date('2026-12-10T12:00:00'))
    const { result } = renderHook(() => useCalendar())
    await waitFor(() => expect(result.current.month).toBe(12))
    act(() => result.current.nextMonth())
    expect(result.current.year).toBe(2027)
    expect(result.current.month).toBe(1)
  })

  it('updateSession で永続化し、該当セッションを差し替える', async () => {
    const { result } = renderHook(() => useCalendar())
    await waitFor(() => expect(result.current.sessionDates.length).toBe(2))
    act(() => result.current.selectDate('2026-06-10'))
    const updated = { ...makeSession('1', '2026-06-10'), name: '変更後' }
    await act(async () => { await result.current.updateSession(updated) })
    expect(mockUpdate).toHaveBeenCalledWith(updated)
    expect(result.current.selectedSessions.find(s => s.id === '1')?.name).toBe('変更後')
  })
})
