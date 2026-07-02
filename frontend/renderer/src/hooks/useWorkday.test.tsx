import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DailyDataProvider } from '../daily/DailyDataContext'
import { useWorkday } from './useWorkday'

const setDailyDay = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('bridge', {
  getDailyMonth: vi.fn().mockResolvedValue({ version: 1, days: {} }),
  setDailyDay,
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <DailyDataProvider>{children}</DailyDataProvider>
)

describe('useWorkday', () => {
  beforeEach(() => setDailyDay.mockClear())

  it('startWork は workStart と telework を保存する', async () => {
    const { result } = renderHook(() => useWorkday('2026-06-10'), { wrapper })
    await act(async () => { result.current.startWork('09:30', true) })
    await waitFor(() => expect(result.current.workStart).toBe('09:30'))
    expect(result.current.telework).toBe(true)
    expect(setDailyDay).toHaveBeenCalledWith('2026-06-10', { workStart: '09:30', telework: true, currentLocation: 'telework' })
  })

  it('endWork は workEnd を保存する', async () => {
    const { result } = renderHook(() => useWorkday('2026-06-10'), { wrapper })
    await act(async () => { result.current.endWork('18:00') })
    await waitFor(() => expect(result.current.workEnd).toBe('18:00'))
    expect(setDailyDay).toHaveBeenCalledWith('2026-06-10', { workEnd: '18:00' })
  })
})
