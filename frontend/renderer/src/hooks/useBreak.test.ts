import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBreak } from './useBreak'
import type { TimerSessionState } from './useTimerSession'
import type { WorkdayState } from './useWorkday'

vi.mock('../repositories/settingsRepository', () => ({
  settingsRepository: {
    getBreakBehavior: vi.fn().mockResolvedValue({ behavior: 'stop' }),
  },
}))

const makeMockTs = (overrides: Partial<TimerSessionState> = {}): TimerSessionState => ({
  isRunning: false,
  isPaused: false,
  elapsedSeconds: 0,
  baseSeconds: 0,
  fillSeconds: 1500,
  activeColor: '#FF9500',
  activeSessionId: null,
  activeTimerName: '',
  activeTimerProjectCode: '',
  activeTimerWorkCategory: '',
  today: '2026-06-18',
  todaySessions: [],
  midnightSession: null,
  stopError: false,
  stopForBreak: vi.fn().mockResolvedValue(null),
  start: vi.fn(),
  startMore: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  adjustStartTime: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  startTelework: vi.fn(),
  dismissMidnightSession: vi.fn(),
  dismissStopError: vi.fn(),
  ...overrides,
})

const makeMockWorkday = (overrides: Partial<WorkdayState> = {}): WorkdayState => ({
  workStart: '09:00',
  workEnd: null,
  breakStart: null,
  breakEnd: null,
  telework: false,
  currentLocation: 'office',
  startWork: vi.fn(),
  endWork: vi.fn(),
  startBreak: vi.fn(),
  endBreak: vi.fn(),
  setBreakMinutes: vi.fn(),
  switchLocation: vi.fn(),
  ...overrides,
})

describe('useBreak', () => {
  it('初期状態は isOnBreak = false', () => {
    const { result } = renderHook(() => useBreak(makeMockTs(), makeMockWorkday()))
    expect(result.current.isOnBreak).toBe(false)
  })

  it('handleBreakStart を呼ぶと isOnBreak = true になり startBreak が呼ばれる', async () => {
    const workday = makeMockWorkday()
    const { result } = renderHook(() => useBreak(makeMockTs(), workday))
    await act(async () => { await result.current.handleBreakStart('PJ', 'dev') })
    expect(result.current.isOnBreak).toBe(true)
    expect(workday.startBreak).toHaveBeenCalledWith(expect.stringMatching(/^\d{2}:\d{2}$/))
  })

  it('タイマー稼働中の handleBreakStart は stopForBreak を呼ぶ', async () => {
    const ts = makeMockTs({ isRunning: true })
    const { result } = renderHook(() => useBreak(ts, makeMockWorkday()))
    await act(async () => { await result.current.handleBreakStart('PJ', 'dev') })
    expect(ts.stopForBreak).toHaveBeenCalledWith('PJ', 'dev')
  })

  it('handleBreakEnd を呼ぶと isOnBreak = false になり endBreak が呼ばれる', async () => {
    const workday = makeMockWorkday()
    const { result } = renderHook(() => useBreak(makeMockTs(), workday))
    await act(async () => { await result.current.handleBreakStart('', '') })
    act(() => { result.current.handleBreakEnd() })
    expect(result.current.isOnBreak).toBe(false)
    expect(workday.endBreak).toHaveBeenCalledWith(expect.stringMatching(/^\d{2}:\d{2}$/))
  })

  it('behavior=stop で break end 後、lastSession があれば startMore を呼ぶ', async () => {
    const session = { id: 's1', taskId: 't1', name: 'test', projectCode: 'PJ', workCategory: 'dev', times: [], date: '2026-06-18', color: '#FF9500', totalTime: 30 }
    const ts = makeMockTs({ isRunning: true, stopForBreak: vi.fn().mockResolvedValue(session) })
    const { result } = renderHook(() => useBreak(ts, makeMockWorkday()))
    await act(async () => { await result.current.handleBreakStart('PJ', 'dev') })
    act(() => { result.current.handleBreakEnd() })
    expect(ts.startMore).toHaveBeenCalledWith(session)
  })

  it('handleBreakEnd は setBreakMinutes を呼ぶ（breakStart からの差分）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T13:00:00'))
    try {
      const workday = makeMockWorkday({ breakStart: '12:00' })
      const { result } = renderHook(() => useBreak(makeMockTs(), workday))
      await act(async () => { await result.current.handleBreakStart('', '') })
      act(() => { result.current.handleBreakEnd() })
      expect(workday.setBreakMinutes).toHaveBeenCalledWith(60)
    } finally {
      vi.useRealTimers()
    }
  })
})
