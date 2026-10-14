import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import { useBreak, type BreakState } from './useBreak'
import type { TimerSessionState } from './useTimerSession'
import type { WorkdayState } from './useWorkday'
import { makeSession } from '../test/factories'

const getBreakBehavior = vi.hoisted(() => vi.fn())
vi.mock('../repositories/settingsRepository', () => ({
  settingsRepository: { getBreakBehavior: () => getBreakBehavior() },
}))

const makeTs = (overrides: Partial<TimerSessionState> = {}): TimerSessionState => ({
  isRunning: false,
  isPaused: false,
  elapsedSeconds: 0,
  baseSeconds: 0,
  fillSeconds: 1800,
  juiceSeconds: 0,
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

const makeWorkday = (overrides: Partial<WorkdayState> = {}): WorkdayState => ({
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

type Hook = RenderHookResult<BreakState, unknown>['result']

/** 休憩時の動作設定を読み込ませてから返す */
async function renderBreak(ts: TimerSessionState, workday: WorkdayState): Promise<Hook> {
  const { result } = renderHook(() => useBreak(ts, workday))
  await act(async () => {})
  return result
}

async function startBreak(hook: Hook): Promise<void> {
  await act(async () => { await hook.current.handleBreakStart('PJ', 'dev') })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-18T12:00:00'))
  getBreakBehavior.mockReset().mockResolvedValue({ behavior: 'stop' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBreak', () => {
  it('初期状態は休憩中ではない', async () => {
    const hook = await renderBreak(makeTs(), makeWorkday())

    expect(hook.current.isOnBreak).toBe(false)
  })

  describe('休憩開始（共通）', () => {
    it('休憩中になる', async () => {
      const hook = await renderBreak(makeTs(), makeWorkday())

      await startBreak(hook)

      expect(hook.current.isOnBreak).toBe(true)
    })

    it('現在時刻を休憩開始として記録する', async () => {
      const workday = makeWorkday()
      const hook = await renderBreak(makeTs(), workday)

      await startBreak(hook)

      expect(workday.startBreak).toHaveBeenCalledWith('12:00')
    })
  })

  describe('休憩終了（共通）', () => {
    it('休憩中でなくなる', async () => {
      const hook = await renderBreak(makeTs(), makeWorkday())
      await startBreak(hook)

      act(() => { hook.current.handleBreakEnd() })

      expect(hook.current.isOnBreak).toBe(false)
    })

    it('現在時刻を休憩終了として記録する', async () => {
      const workday = makeWorkday()
      const hook = await renderBreak(makeTs(), workday)
      await startBreak(hook)
      vi.setSystemTime(new Date('2026-06-18T12:45:00'))

      act(() => { hook.current.handleBreakEnd() })

      expect(workday.endBreak).toHaveBeenCalledWith('12:45')
    })

    it('休憩開始からの差分を休憩分として記録する', async () => {
      const workday = makeWorkday({ breakStart: '12:00' })
      const hook = await renderBreak(makeTs(), workday)
      await startBreak(hook)
      vi.setSystemTime(new Date('2026-06-18T12:45:00'))

      act(() => { hook.current.handleBreakEnd() })

      expect(workday.setBreakMinutes).toHaveBeenCalledWith(45)
    })
  })

  describe('休憩時の動作が「停止」', () => {
    it('計測中なら、そのときの PJコード・作業区分で計測を止めて保存する', async () => {
      const ts = makeTs({ isRunning: true })
      const hook = await renderBreak(ts, makeWorkday())

      await startBreak(hook)

      expect(ts.stopForBreak).toHaveBeenCalledWith('PJ', 'dev')
    })

    it('計測していなければ止める処理を呼ばない', async () => {
      const ts = makeTs({ isRunning: false })
      const hook = await renderBreak(ts, makeWorkday())

      await startBreak(hook)

      expect(ts.stopForBreak).not.toHaveBeenCalled()
    })

    it('休憩終了で、止めた作業を「もう一杯」で再開する', async () => {
      const session = makeSession()
      const ts = makeTs({ isRunning: true, stopForBreak: vi.fn().mockResolvedValue(session) })
      const hook = await renderBreak(ts, makeWorkday())
      await startBreak(hook)

      act(() => { hook.current.handleBreakEnd() })

      expect(ts.startMore).toHaveBeenCalledWith(session)
    })

    it('休憩前に計測していなければ、休憩終了で何も再開しない', async () => {
      const ts = makeTs({ isRunning: false })
      const hook = await renderBreak(ts, makeWorkday())
      await startBreak(hook)

      act(() => { hook.current.handleBreakEnd() })

      expect(ts.startMore).not.toHaveBeenCalled()
    })

    it('再開は一度きり（次の休憩終了で同じ作業を再開しない）', async () => {
      const ts = makeTs({ isRunning: true, stopForBreak: vi.fn().mockResolvedValue(makeSession()) })
      const hook = await renderBreak(ts, makeWorkday())
      await startBreak(hook)
      act(() => { hook.current.handleBreakEnd() })

      act(() => { hook.current.handleBreakEnd() })

      expect(ts.startMore).toHaveBeenCalledOnce()
    })
  })

  describe('休憩時の動作が「一時停止」', () => {
    beforeEach(() => {
      getBreakBehavior.mockResolvedValue({ behavior: 'pause' })
    })

    it('休憩開始でタイマーを一時停止する', async () => {
      const ts = makeTs({ isRunning: true })
      const hook = await renderBreak(ts, makeWorkday())

      await startBreak(hook)

      expect(ts.pause).toHaveBeenCalledOnce()
    })

    it('計測を止めて保存はしない', async () => {
      const ts = makeTs({ isRunning: true })
      const hook = await renderBreak(ts, makeWorkday())

      await startBreak(hook)

      expect(ts.stopForBreak).not.toHaveBeenCalled()
    })

    it('休憩終了でタイマーを再開する', async () => {
      const ts = makeTs({ isRunning: true })
      const hook = await renderBreak(ts, makeWorkday())
      await startBreak(hook)

      act(() => { hook.current.handleBreakEnd() })

      expect(ts.resume).toHaveBeenCalledOnce()
    })
  })
})
