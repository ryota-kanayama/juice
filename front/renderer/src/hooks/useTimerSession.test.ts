import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimerSession } from './useTimerSession'
import type { SessionsState } from './useSessions'
import type { Session } from '../types/session'

vi.mock('./useTimer')
import { useTimer } from './useTimer'

const TODAY = '2026-06-17'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1', taskId: 's1', name: 'テスト作業',
    projectCode: 'PROJ', workCategory: '開発',
    times: [], date: TODAY, color: '#fff', totalTime: 30,
    ...overrides,
  }
}

const mockTimerStart = vi.fn()
const mockTimerStartMore = vi.fn()
const mockTimerStop = vi.fn()
const mockTimerCancel = vi.fn()
const mockTimerAdjustStartTime = vi.fn()

const mockTimerPause = vi.fn()
const mockTimerResume = vi.fn()

function makeTimerMock(overrides = {}) {
  return {
    isRunning: false,
    isPaused: false,
    elapsedSeconds: 0,
    baseSeconds: 0,
    fillSeconds: 1500,
    activeColor: '#fff',
    activeSessionId: null as string | null,
    start: mockTimerStart,
    startMore: mockTimerStartMore,
    stop: mockTimerStop,
    cancel: mockTimerCancel,
    adjustStartTime: mockTimerAdjustStartTime,
    pause: mockTimerPause,
    resume: mockTimerResume,
    ...overrides,
  }
}

const mockUpsertToday = vi.fn()
const mockApplyStartMore = vi.fn()
const mockRemove = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockAdd = vi.fn().mockResolvedValue(undefined)
const mockStartTelework = vi.fn().mockResolvedValue(undefined)

const mockSessions: SessionsState = {
  today: TODAY,
  todaySessions: [],
  upsertToday: mockUpsertToday,
  applyStartMore: mockApplyStartMore,
  update: mockUpdate,
  add: mockAdd,
  remove: mockRemove,
  startTelework: mockStartTelework,
}

describe('useTimerSession', () => {
  beforeEach(() => {
    vi.mocked(useTimer).mockReturnValue(makeTimerMock())
    mockTimerStart.mockClear()
    mockTimerStartMore.mockClear()
    mockTimerStop.mockReset()
    mockTimerCancel.mockClear()
    mockUpsertToday.mockClear()
    mockApplyStartMore.mockClear()
    mockRemove.mockClear()
  })

  it('start は activeTimerName を更新して timerStart を呼ぶ', () => {
    const { result } = renderHook(() => useTimerSession(mockSessions))
    act(() => { result.current.start('テスト', 'PROJ', '開発') })
    expect(result.current.activeTimerName).toBe('テスト')
    expect(result.current.activeTimerProjectCode).toBe('PROJ')
    expect(mockTimerStart).toHaveBeenCalledWith('テスト', undefined, undefined)
  })

  it('startMore は activeTimerName を更新して applyStartMore と timerStartMore を呼ぶ', () => {
    const session = makeSession()
    const { result } = renderHook(() => useTimerSession(mockSessions))
    act(() => { result.current.startMore(session) })
    expect(result.current.activeTimerName).toBe(session.name)
    expect(mockApplyStartMore).toHaveBeenCalledWith(session)
    expect(mockTimerStartMore).toHaveBeenCalledWith(session)
  })

  it('stop 正常系: upsertToday を呼んで stopError が false のまま', async () => {
    const session = makeSession({ date: TODAY })
    mockTimerStop.mockResolvedValue(session)
    const { result } = renderHook(() => useTimerSession(mockSessions))
    await act(async () => { await result.current.stop('PROJ', '開発') })
    expect(mockUpsertToday).toHaveBeenCalledWith(session)
    expect(result.current.stopError).toBe(false)
    expect(result.current.midnightSession).toBeNull()
  })

  it('stop 日付跨ぎ: upsertToday を呼ばず midnightSession がセットされる', async () => {
    const session = makeSession({ date: '2026-06-16' })
    mockTimerStop.mockResolvedValue(session)
    const { result } = renderHook(() => useTimerSession(mockSessions))
    await act(async () => { await result.current.stop('PROJ', '開発') })
    expect(mockUpsertToday).not.toHaveBeenCalled()
    expect(result.current.midnightSession).toEqual(session)
  })

  it('stop 保存失敗: stopError が true になる', async () => {
    mockTimerStop.mockRejectedValue(new Error('save failed'))
    const { result } = renderHook(() => useTimerSession(mockSessions))
    await act(async () => { await result.current.stop('PROJ', '開発') })
    expect(result.current.stopError).toBe(true)
    expect(mockUpsertToday).not.toHaveBeenCalled()
  })

  it('remove 稼働中セッション: cancel を呼んでから remove を呼ぶ', async () => {
    vi.mocked(useTimer).mockReturnValue(makeTimerMock({ activeSessionId: 's1' }))
    const { result } = renderHook(() => useTimerSession(mockSessions))
    await act(async () => { await result.current.remove('s1') })
    expect(mockTimerCancel).toHaveBeenCalled()
    expect(mockRemove).toHaveBeenCalledWith('s1')
  })

  it('remove 停止中セッション: cancel を呼ばずに remove のみ', async () => {
    const { result } = renderHook(() => useTimerSession(mockSessions))
    await act(async () => { await result.current.remove('s1') })
    expect(mockTimerCancel).not.toHaveBeenCalled()
    expect(mockRemove).toHaveBeenCalledWith('s1')
  })

  it('dismissMidnightSession で midnightSession が null になる', async () => {
    const session = makeSession({ date: '2026-06-16' })
    mockTimerStop.mockResolvedValue(session)
    const { result } = renderHook(() => useTimerSession(mockSessions))
    await act(async () => { await result.current.stop('PROJ', '開発') })
    expect(result.current.midnightSession).not.toBeNull()
    act(() => { result.current.dismissMidnightSession() })
    expect(result.current.midnightSession).toBeNull()
  })

  it('dismissStopError で stopError が false になる', async () => {
    mockTimerStop.mockRejectedValue(new Error('save failed'))
    const { result } = renderHook(() => useTimerSession(mockSessions))
    await act(async () => { await result.current.stop('PROJ', '開発') })
    expect(result.current.stopError).toBe(true)
    act(() => { result.current.dismissStopError() })
    expect(result.current.stopError).toBe(false)
  })
})
