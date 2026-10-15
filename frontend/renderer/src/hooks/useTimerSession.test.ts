import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import { useTimerSession, type TimerSessionState } from './useTimerSession'
import type { SessionsState } from './useSessions'
import type { TimerState } from './useTimer'
import type { Session } from '../types/session'
import { makeSession } from '../test/factories'

vi.mock('./useTimer')
import { useTimer } from './useTimer'

const TODAY = '2026-06-17'
const YESTERDAY = '2026-06-16'

const timer = {
  start: vi.fn(),
  startMore: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  adjustStartTime: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}

function mockTimer(overrides: Partial<TimerState> = {}): void {
  vi.mocked(useTimer).mockReturnValue({
    isRunning: false,
    isPaused: false,
    elapsedSeconds: 0,
    baseSeconds: 0,
    fillSeconds: 1800,
    juiceSeconds: 0,
    activeColor: '#fff',
    activeSessionId: null,
    ...timer,
    ...overrides,
  })
}

const sessions = {
  upsertToday: vi.fn(),
  applyStartMore: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  startTelework: vi.fn(),
}

const sessionsState: SessionsState = { today: TODAY, todaySessions: [], ...sessions }

type Hook = RenderHookResult<TimerSessionState, unknown>['result']

function renderTimerSession(): Hook {
  return renderHook(() => useTimerSession(sessionsState)).result
}

async function stop(hook: Hook): Promise<void> {
  await act(async () => { await hook.current.stop('PROJ', '開発') })
}

async function stopForBreak(hook: Hook): Promise<Session | null> {
  let result: Session | null = null
  await act(async () => { result = await hook.current.stopForBreak('PROJ', '開発') })
  return result
}

beforeEach(() => {
  vi.resetAllMocks()
  sessions.remove.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockTimer()
})

describe('useTimerSession', () => {
  describe('start', () => {
    it('計測中の作業名・PJコード・作業区分を持つ', () => {
      const hook = renderTimerSession()

      act(() => { hook.current.start('テスト', 'PROJ', '開発') })

      expect(hook.current).toMatchObject({
        activeTimerName: 'テスト',
        activeTimerProjectCode: 'PROJ',
        activeTimerWorkCategory: '開発',
      })
    })

    it('PJコード・作業区分を省略したら空文字', () => {
      const hook = renderTimerSession()

      act(() => { hook.current.start('テスト') })

      expect(hook.current).toMatchObject({ activeTimerProjectCode: '', activeTimerWorkCategory: '' })
    })

    it('タイマーを作業名と勤務場所で開始する（色は自動）', () => {
      const hook = renderTimerSession()

      act(() => { hook.current.start('テスト', 'PROJ', '開発', 'telework') })

      expect(timer.start).toHaveBeenCalledWith('テスト', undefined, 'telework')
    })
  })

  describe('startMore', () => {
    it('延長するセッションの作業名・PJコード・作業区分を持つ', () => {
      const hook = renderTimerSession()

      act(() => { hook.current.startMore(makeSession({ name: '既存', projectCode: 'P9', workCategory: '設計' })) })

      expect(hook.current).toMatchObject({
        activeTimerName: '既存',
        activeTimerProjectCode: 'P9',
        activeTimerWorkCategory: '設計',
      })
    })

    it('一覧に稼働中の区間を即時反映する', () => {
      const session = makeSession()
      const hook = renderTimerSession()

      act(() => { hook.current.startMore(session) })

      expect(sessions.applyStartMore).toHaveBeenCalledWith(session)
    })

    it('タイマーを延長モードで開始する', () => {
      const session = makeSession()
      const hook = renderTimerSession()

      act(() => { hook.current.startMore(session) })

      expect(timer.startMore).toHaveBeenCalledWith(session)
    })
  })

  describe('stop', () => {
    it('PJコード・作業区分を渡してタイマーを止める', async () => {
      timer.stop.mockResolvedValue(makeSession({ date: TODAY }))
      const hook = renderTimerSession()

      await stop(hook)

      expect(timer.stop).toHaveBeenCalledWith({ projectCode: 'PROJ', workCategory: '開発' })
    })

    it('今日のセッションなら一覧に反映する', async () => {
      const saved = makeSession({ date: TODAY })
      timer.stop.mockResolvedValue(saved)
      const hook = renderTimerSession()

      await stop(hook)

      expect(sessions.upsertToday).toHaveBeenCalledWith(saved)
    })

    it('今日のセッションなら日付またぎの案内は出さない', async () => {
      timer.stop.mockResolvedValue(makeSession({ date: TODAY }))
      const hook = renderTimerSession()

      await stop(hook)

      expect(hook.current.midnightSession).toBeNull()
    })

    it('日付をまたいだセッションは、今日の一覧に入れない', async () => {
      timer.stop.mockResolvedValue(makeSession({ date: YESTERDAY }))
      const hook = renderTimerSession()

      await stop(hook)

      expect(sessions.upsertToday).not.toHaveBeenCalled()
    })

    it('日付をまたいだセッションは、案内用に midnightSession に持つ', async () => {
      const saved = makeSession({ date: YESTERDAY })
      timer.stop.mockResolvedValue(saved)
      const hook = renderTimerSession()

      await stop(hook)

      expect(hook.current.midnightSession).toEqual(saved)
    })

    it('タイマーが止まらなかった（null）なら何もしない', async () => {
      timer.stop.mockResolvedValue(null)
      const hook = renderTimerSession()

      await stop(hook)

      expect(sessions.upsertToday).not.toHaveBeenCalled()
    })

    it('保存に失敗したら stopError を立てる', async () => {
      timer.stop.mockRejectedValue(new Error('save failed'))
      const hook = renderTimerSession()

      await stop(hook)

      expect(hook.current.stopError).toBe(true)
    })

    it('保存に失敗したら一覧に反映しない', async () => {
      timer.stop.mockRejectedValue(new Error('save failed'))
      const hook = renderTimerSession()

      await stop(hook)

      expect(sessions.upsertToday).not.toHaveBeenCalled()
    })

    it('再試行で保存できたら stopError を下ろす', async () => {
      timer.stop.mockRejectedValueOnce(new Error('save failed'))
      timer.stop.mockResolvedValueOnce(makeSession({ date: TODAY }))
      const hook = renderTimerSession()
      await stop(hook)

      await stop(hook)

      expect(hook.current.stopError).toBe(false)
    })
  })

  describe('stopForBreak（休憩開始による停止）', () => {
    it('PJコード・作業区分を渡してタイマーを止める', async () => {
      timer.stop.mockResolvedValue(makeSession({ date: TODAY }))
      const hook = renderTimerSession()

      await stopForBreak(hook)

      expect(timer.stop).toHaveBeenCalledWith({ projectCode: 'PROJ', workCategory: '開発' })
    })

    it('保存したセッションを返す', async () => {
      const saved = makeSession({ date: TODAY })
      timer.stop.mockResolvedValue(saved)
      const hook = renderTimerSession()

      const result = await stopForBreak(hook)

      expect(result).toEqual(saved)
    })

    it('今日のセッションなら一覧に反映する', async () => {
      const saved = makeSession({ date: TODAY })
      timer.stop.mockResolvedValue(saved)
      const hook = renderTimerSession()

      await stopForBreak(hook)

      expect(sessions.upsertToday).toHaveBeenCalledWith(saved)
    })

    it('日付をまたいだセッションは一覧に入れず、案内も出さない', async () => {
      timer.stop.mockResolvedValue(makeSession({ date: YESTERDAY }))
      const hook = renderTimerSession()

      await stopForBreak(hook)

      expect(sessions.upsertToday).not.toHaveBeenCalled()
      expect(hook.current.midnightSession).toBeNull()
    })

    it('保存に失敗したら stopError を立てて null を返す', async () => {
      timer.stop.mockRejectedValue(new Error('save failed'))
      const hook = renderTimerSession()

      const result = await stopForBreak(hook)

      expect(result).toBeNull()
      expect(hook.current.stopError).toBe(true)
    })
  })

  describe('remove', () => {
    it('計測中のセッションなら、タイマーを取り消してから削除する', async () => {
      mockTimer({ activeSessionId: 's1' })
      const order: string[] = []
      timer.cancel.mockImplementation(() => { order.push('cancel') })
      sessions.remove.mockImplementation(async () => { order.push('remove') })
      const hook = renderTimerSession()

      await act(async () => { await hook.current.remove('s1') })

      expect(order).toEqual(['cancel', 'remove'])
    })

    it('計測中でないセッションなら、タイマーには触れずに削除する', async () => {
      mockTimer({ activeSessionId: 'other' })
      const hook = renderTimerSession()

      await act(async () => { await hook.current.remove('s1') })

      expect(timer.cancel).not.toHaveBeenCalled()
      expect(sessions.remove).toHaveBeenCalledWith('s1')
    })
  })

  describe('案内の消去', () => {
    it('dismissMidnightSession で日付またぎの案内を消す', async () => {
      timer.stop.mockResolvedValue(makeSession({ date: YESTERDAY }))
      const hook = renderTimerSession()
      await stop(hook)

      act(() => { hook.current.dismissMidnightSession() })

      expect(hook.current.midnightSession).toBeNull()
    })

    it('dismissStopError で保存失敗の案内を消す', async () => {
      timer.stop.mockRejectedValue(new Error('save failed'))
      const hook = renderTimerSession()
      await stop(hook)

      act(() => { hook.current.dismissStopError() })

      expect(hook.current.stopError).toBe(false)
    })
  })

  it('今日の日付とセッション一覧は useSessions の値をそのまま返す', () => {
    const hook = renderTimerSession()

    expect(hook.current.today).toBe(TODAY)
    expect(hook.current.todaySessions).toBe(sessionsState.todaySessions)
  })
})
