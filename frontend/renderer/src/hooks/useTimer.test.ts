import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import { useTimer, type TimerState } from './useTimer'
import { totalMinutesOf } from '../domain/session'
import type { Session } from '../types/session'
import { interval, makeSession } from '../test/factories'

const mockSaveSession = vi.fn()
const mockUpdateSession = vi.fn()
const mockGetSessions = vi.fn()
const mockGetElapsedSettings = vi.fn()
const mockTimerStarted = vi.fn()
const mockTimerStopped = vi.fn()
const mockTimerAdjustStartTime = vi.fn()
let elapsedFiredCallback: (() => void) | null = null
vi.stubGlobal('bridge', {
  saveSession: mockSaveSession,
  updateSession: mockUpdateSession,
  getSessions: mockGetSessions,
  timerStarted: mockTimerStarted,
  timerStopped: mockTimerStopped,
  timerAdjustStartTime: mockTimerAdjustStartTime,
  getElapsedSettings: mockGetElapsedSettings,
  onElapsedNotificationFired: (cb: () => void) => {
    elapsedFiredCallback = cb
    return () => { elapsedFiredCallback = null }
  },
})

/** 計測の開始時刻。区間の文字列を検証できるよう固定する */
const START = new Date('2026-02-27T10:00:00')

/** 「もう一杯」で延長する既存セッション（08:00〜09:00 の60分、合計は区間と一致） */
const existing = (overrides: Partial<Session> = {}): Session => makeSession({
  id: 'existing-id',
  taskId: 'existing-id',
  name: 'メール作業',
  projectCode: 'P001',
  workCategory: '開発',
  times: [interval('2026-02-27T08:00:00', '2026-02-27T09:00:00')],
  date: '2026-02-27',
  totalTime: 60,
  ...overrides,
})

type Hook = RenderHookResult<TimerState, unknown>['result']

function renderTimer(): Hook {
  return renderHook(() => useTimer()).result
}

function advance(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms) })
}

/** start して、設定の読み込み（Promise）まで反映させる */
async function startTimer(hook: Hook, ...args: Parameters<TimerState['start']>): Promise<void> {
  await act(async () => { hook.current.start(...args) })
}

async function startMoreTimer(hook: Hook, session: Session): Promise<void> {
  await act(async () => { hook.current.startMore(session) })
}

async function stopTimer(hook: Hook, opts?: Parameters<TimerState['stop']>[0]): Promise<Session | null> {
  let session: Session | null = null
  await act(async () => { session = await hook.current.stop(opts) })
  return session
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  mockSaveSession.mockReset().mockResolvedValue(undefined)
  mockUpdateSession.mockReset().mockResolvedValue(undefined)
  mockGetSessions.mockReset().mockResolvedValue([])
  mockGetElapsedSettings.mockReset().mockResolvedValue({ enabled: false, minutes: 30 })
  mockTimerStarted.mockReset().mockResolvedValue(undefined)
  mockTimerStopped.mockReset().mockResolvedValue(undefined)
  mockTimerAdjustStartTime.mockReset().mockResolvedValue(undefined)
  elapsedFiredCallback = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTimer', () => {
  describe('初期状態', () => {
    it('停止中で、経過・延長・稼働中セッションはいずれも無い', () => {
      const hook = renderTimer()

      expect(hook.current).toMatchObject({
        isRunning: false,
        isPaused: false,
        elapsedSeconds: 0,
        baseSeconds: 0,
        juiceSeconds: 0,
        activeSessionId: null,
      })
    })

    it('fillSeconds は 1800（30分）', () => {
      const hook = renderTimer()

      expect(hook.current.fillSeconds).toBe(1800)
    })
  })

  describe('start', () => {
    it('計測中になる', async () => {
      const hook = renderTimer()

      await startTimer(hook, 'テスト作業')

      expect(hook.current.isRunning).toBe(true)
    })

    it('1秒ごとに elapsedSeconds が増える', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')

      advance(3000)

      expect(hook.current.elapsedSeconds).toBe(3)
    })

    it('バックエンドへ開始を通知する', async () => {
      const hook = renderTimer()

      await startTimer(hook, 'テスト作業')

      expect(mockTimerStarted).toHaveBeenCalledOnce()
    })
  })

  describe('stop（新規の計測）', () => {
    it('計測を止める', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(60_000)

      await stopTimer(hook)

      expect(hook.current.isRunning).toBe(false)
    })

    it('開始から停止までの区間を1つ持つセッションを返す', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(60_000)

      const session = await stopTimer(hook)

      expect(session?.times).toEqual([interval('2026-02-27T10:00:00', '2026-02-27T10:01:00')])
    })

    it('開始時の名前・色と、停止時の PJコード・作業区分を持つ', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業', '#FF9500')
      advance(60_000)

      const session = await stopTimer(hook, { projectCode: 'P001', workCategory: '開発' })

      expect(session).toMatchObject({
        name: 'テスト作業',
        color: '#FF9500',
        projectCode: 'P001',
        workCategory: '開発',
        date: '2026-02-27',
      })
    })

    it('id と taskId を新しく振る', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(60_000)

      const session = await stopTimer(hook)

      expect(session).toMatchObject({ id: expect.stringMatching(/.+/), taskId: expect.stringMatching(/.+/) })
    })

    it('返したセッションを新規保存する（更新ではない）', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(60_000)

      const session = await stopTimer(hook)

      expect(mockSaveSession).toHaveBeenCalledExactlyOnceWith(session)
      expect(mockUpdateSession).not.toHaveBeenCalled()
    })

    it('バックエンドへ停止を通知する', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(60_000)

      await stopTimer(hook)

      expect(mockTimerStopped).toHaveBeenCalledOnce()
    })

    it('計測していなければ何もせず null を返す', async () => {
      const hook = renderTimer()

      const session = await stopTimer(hook)

      expect(session).toBeNull()
    })

    it.each([
      ['30秒未満でも区間があれば下限の1分', 20_000, 1],
      ['30秒以上は1分に四捨五入', 40_000, 1],
      ['90秒は2分に四捨五入', 90_000, 2],
    ])('totalTime: %s', async (_label, ms, expected) => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(ms)

      const session = await stopTimer(hook)

      expect(session?.totalTime).toBe(expected)
    })

    it('totalTime は区間の合計と一致する（不変条件）', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(20_000)

      const session = await stopTimer(hook)

      expect(session?.totalTime).toBe(totalMinutesOf(session!.times))
    })

    it('telework で開始したら workLocation を保存する', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'タスク', undefined, 'telework')
      advance(60_000)

      await stopTimer(hook)

      expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({ workLocation: 'telework' }))
    })

    it('office（既定）で開始したら workLocation を保存しない', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'タスク', undefined, 'office')
      advance(60_000)

      const session = await stopTimer(hook)

      expect(session).not.toHaveProperty('workLocation')
    })
  })

  describe('stop の保存が失敗したとき（データロス防止）', () => {
    async function failOnce(mode: 'new' | 'extend'): Promise<{ hook: Hook; stopping: Promise<unknown> }> {
      const hook = renderTimer()
      if (mode === 'new') {
        mockSaveSession.mockRejectedValueOnce(new Error('disk full'))
        await startTimer(hook, 'テスト作業')
      } else {
        mockUpdateSession.mockRejectedValueOnce(new Error('disk full'))
        await startMoreTimer(hook, existing())
      }
      advance(60_000)
      let stopping: Promise<unknown> = Promise.resolve()
      await act(async () => {
        stopping = hook.current.stop().catch((e: unknown) => e)
        await stopping
      })
      return { hook, stopping }
    }

    it.each(['new', 'extend'] as const)('%s: 例外を呼び出し元へ伝える', async (mode) => {
      const { stopping } = await failOnce(mode)

      const error = await stopping

      expect(error).toEqual(new Error('disk full'))
    })

    it.each(['new', 'extend'] as const)('%s: 計測を止めない', async (mode) => {
      const { hook } = await failOnce(mode)

      expect(hook.current.isRunning).toBe(true)
    })

    it.each(['new', 'extend'] as const)('%s: 開始時刻を保ったまま計測を続ける', async (mode) => {
      const { hook } = await failOnce(mode)

      advance(2000)

      expect(hook.current.elapsedSeconds).toBe(62)
    })

    it('再試行すれば保存できる', async () => {
      const { hook } = await failOnce('new')

      const session = await stopTimer(hook)

      expect(session).not.toBeNull()
    })

    it('バックエンドへ停止を通知しない', async () => {
      await failOnce('new')

      expect(mockTimerStopped).not.toHaveBeenCalled()
    })
  })

  describe('stop を素早く2回呼んだとき（二重記録防止）', () => {
    async function stopTwice(hook: Hook): Promise<[Session | null, Session | null]> {
      let results: [Session | null, Session | null] = [null, null]
      await act(async () => {
        results = await Promise.all([hook.current.stop(), hook.current.stop()])
      })
      return results
    }

    it('新規: 保存は1回だけ', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(60_000)

      await stopTwice(hook)

      expect(mockSaveSession).toHaveBeenCalledOnce()
    })

    it('2回目の呼び出しは null を返す', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト作業')
      advance(60_000)

      const [, second] = await stopTwice(hook)

      expect(second).toBeNull()
    })

    it('延長: 更新は1回だけで、区間も1つだけ追加される', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing())
      advance(60_000)

      await stopTwice(hook)

      expect(mockUpdateSession.mock.calls.map(([s]) => s.times.length)).toEqual([2])
    })
  })

  describe('startMore（もう一杯）', () => {
    it('計測中になり、延長中のセッション id を持つ', async () => {
      const hook = renderTimer()

      await startMoreTimer(hook, existing())

      expect(hook.current).toMatchObject({ isRunning: true, activeSessionId: 'existing-id' })
    })

    it('baseSeconds は既存の totalTime × 60（表示は累計から始まる）', async () => {
      const hook = renderTimer()

      await startMoreTimer(hook, existing({ totalTime: 25 }))

      expect(hook.current.baseSeconds).toBe(1500)
    })

    it('elapsedSeconds は 0 から数える', async () => {
      const hook = renderTimer()

      await startMoreTimer(hook, existing({ totalTime: 25 }))

      expect(hook.current.elapsedSeconds).toBe(0)
    })

    it('バックエンドへ開始を通知する', async () => {
      const hook = renderTimer()

      await startMoreTimer(hook, existing())

      expect(mockTimerStarted).toHaveBeenCalledOnce()
    })
  })

  describe('stop（延長の計測）', () => {
    it('同じ id のまま、区間を末尾に追加したセッションを返す', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing())
      advance(60_000)

      const session = await stopTimer(hook)

      expect(session).toMatchObject({
        id: 'existing-id',
        times: [
          interval('2026-02-27T08:00:00', '2026-02-27T09:00:00'),
          interval('2026-02-27T10:00:00', '2026-02-27T10:01:00'),
        ],
      })
    })

    it('新規保存ではなく更新で保存する', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing())
      advance(60_000)

      const session = await stopTimer(hook)

      expect(mockUpdateSession).toHaveBeenCalledExactlyOnceWith(session)
      expect(mockSaveSession).not.toHaveBeenCalled()
    })

    it('停止時の PJコード・作業区分で上書きできる', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing({ projectCode: 'OLD', workCategory: '設計' }))
      advance(60_000)

      const session = await stopTimer(hook, { projectCode: 'NEW', workCategory: '実装' })

      expect(session).toMatchObject({ projectCode: 'NEW', workCategory: '実装' })
    })

    it('30秒未満なら totalTime は増えない', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing({ totalTime: 60 }))
      advance(20_000)

      const session = await stopTimer(hook)

      expect(session?.totalTime).toBe(60)
    })

    it('区間が2つになっても totalTime は区間の合計から算出する（区間ごとに丸めない）', async () => {
      // 90秒の区間を2つ: 区間ごとに丸めると 2+2=4 分、合計してから丸めると 3 分
      const hook = renderTimer()
      await startMoreTimer(hook, existing({ times: [interval('2026-02-27T08:00:00', '2026-02-27T08:01:30')], totalTime: 2 }))
      advance(90_000)

      const session = await stopTimer(hook)

      expect(session?.totalTime).toBe(3)
    })

    it('手で合計を変えた記録（区間の合計と食い違う）は、計測ぶんを加算する', async () => {
      // 区間30分・合計45分 = 手で整えた合計。区間から算出し直すと手入力値が消える
      const hook = renderTimer()
      await startMoreTimer(hook, existing({ times: [interval('2026-02-27T08:00:00', '2026-02-27T08:30:00')], totalTime: 45 }))
      advance(600_000)

      const session = await stopTimer(hook)

      expect(session?.totalTime).toBe(55)
    })

    it('baseSeconds を 0 に戻す', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing({ totalTime: 25 }))
      advance(60_000)

      await stopTimer(hook)

      expect(hook.current.baseSeconds).toBe(0)
    })
  })

  // 「もう一杯」から停止までの間に他のウィンドウ（カレンダー）で直された内容を、
  // 停止時の保存で消さないこと。土台はスナップショットではなくディスクの最新。
  describe('延長の停止はディスクの最新を土台にする', () => {
    const snapshot = existing({
      id: 'ext-id',
      name: 'スナップショットの名前',
      projectCode: 'OLD-PJ',
      workCategory: '旧区分',
      times: [interval('2026-02-27T09:00:00', '2026-02-27T09:30:00')],
      totalTime: 30,
    })

    async function extendAndStop(opts?: Parameters<TimerState['stop']>[0]): Promise<Session | null> {
      const hook = renderTimer()
      await startMoreTimer(hook, snapshot)
      advance(600_000) // 10分
      return stopTimer(hook, opts)
    }

    it('ディスクで直された名前を保存する', async () => {
      mockGetSessions.mockResolvedValue([{ ...snapshot, name: 'カレンダーで直した名前' }])

      const session = await extendAndStop()

      expect(session?.name).toBe('カレンダーで直した名前')
    })

    it('ディスクで直された区間に、今回の区間を足す', async () => {
      // カレンダーで開始を 08:00 に直した（30分 → 90分）
      mockGetSessions.mockResolvedValue([{
        ...snapshot,
        times: [interval('2026-02-27T08:00:00', '2026-02-27T09:30:00')],
        totalTime: 90,
      }])

      const session = await extendAndStop()

      expect(session?.times).toEqual([
        interval('2026-02-27T08:00:00', '2026-02-27T09:30:00'),
        interval('2026-02-27T10:00:00', '2026-02-27T10:10:00'),
      ])
    })

    it('ディスクで直された区間をもとに totalTime を算出する', async () => {
      mockGetSessions.mockResolvedValue([{
        ...snapshot,
        times: [interval('2026-02-27T08:00:00', '2026-02-27T09:30:00')],
        totalTime: 90,
      }])

      const session = await extendAndStop()

      expect(session?.totalTime).toBe(100)
    })

    it('ディスクの記録が手で整えた合計を持つなら加算する', async () => {
      mockGetSessions.mockResolvedValue([{ ...snapshot, totalTime: 45 }])

      const session = await extendAndStop()

      expect(session?.totalTime).toBe(55)
    })

    it('停止時に指定した PJコード・作業区分はディスクの値より優先する', async () => {
      mockGetSessions.mockResolvedValue([{ ...snapshot, projectCode: 'DISK-PJ', workCategory: 'ディスク区分' }])

      const session = await extendAndStop({ projectCode: 'NEW-PJ', workCategory: '新区分' })

      expect(session).toMatchObject({ projectCode: 'NEW-PJ', workCategory: '新区分' })
    })

    it('停止時に指定が無ければディスクの PJコード・作業区分を使う', async () => {
      mockGetSessions.mockResolvedValue([{ ...snapshot, projectCode: 'DISK-PJ', workCategory: 'ディスク区分' }])

      const session = await extendAndStop()

      expect(session).toMatchObject({ projectCode: 'DISK-PJ', workCategory: 'ディスク区分' })
    })

    it('セッションのある月を読みにいく', async () => {
      await extendAndStop()

      expect(mockGetSessions).toHaveBeenCalledWith('2026-02')
    })

    it('読み込みが失敗したらスナップショットを土台に保存する（計測ぶんを失わない）', async () => {
      mockGetSessions.mockRejectedValue(new Error('disk error'))

      await extendAndStop()

      expect(mockUpdateSession).toHaveBeenCalledWith(expect.objectContaining({
        name: 'スナップショットの名前',
        totalTime: 40,
      }))
    })

    it('ディスクから消えていたらスナップショットを土台に保存する', async () => {
      mockGetSessions.mockResolvedValue([])

      await extendAndStop()

      expect(mockUpdateSession).toHaveBeenCalledWith(expect.objectContaining({
        name: 'スナップショットの名前',
        totalTime: 40,
      }))
    })

    it('終了時刻は読み込みより前に確定する（読み込みにかかった時間を作業時間に含めない）', async () => {
      let resolveRead: (v: Session[]) => void = () => {}
      mockGetSessions.mockReturnValue(new Promise(r => { resolveRead = r }))
      const hook = renderTimer()
      await startMoreTimer(hook, snapshot)
      advance(600_000) // 10分計測
      let session: Session | null = null
      const stopping = act(async () => { session = await hook.current.stop() })

      await act(async () => { vi.advanceTimersByTime(300_000) }) // 読み込みに5分かかる
      await act(async () => { resolveRead([snapshot]) })
      await stopping

      expect(session!.totalTime).toBe(40)
    })
  })

  describe('cancel', () => {
    it('計測を止め、延長中のセッション id を外す', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing())

      act(() => { hook.current.cancel() })

      expect(hook.current).toMatchObject({ isRunning: false, activeSessionId: null })
    })

    it('何も保存しない', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')

      act(() => { hook.current.cancel() })

      expect(mockSaveSession).not.toHaveBeenCalled()
      expect(mockUpdateSession).not.toHaveBeenCalled()
    })

    it('バックエンドへ停止を通知する', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')

      act(() => { hook.current.cancel() })

      expect(mockTimerStopped).toHaveBeenCalledOnce()
    })

    it('baseSeconds を 0 に戻す', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing({ totalTime: 25 }))

      act(() => { hook.current.cancel() })

      expect(hook.current.baseSeconds).toBe(0)
    })

    it('計測していなければバックエンドへ通知しない', () => {
      const hook = renderTimer()

      act(() => { hook.current.cancel() })

      expect(mockTimerStopped).not.toHaveBeenCalled()
    })
  })

  describe('baseSeconds', () => {
    it('新規の start では 0', async () => {
      const hook = renderTimer()

      await startTimer(hook, '新規作業')

      expect(hook.current.baseSeconds).toBe(0)
    })

    it('延長のあとに新規 start すると 0 に戻る', async () => {
      const hook = renderTimer()
      await startMoreTimer(hook, existing({ totalTime: 25 }))
      act(() => { hook.current.cancel() })

      await startTimer(hook, '新規作業')

      expect(hook.current.baseSeconds).toBe(0)
    })
  })

  describe('fillSeconds（ジュースが満杯になるまでの秒数）', () => {
    it('経過時間通知 OFF なら 1800', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 45 })
      const hook = renderTimer()

      await startTimer(hook, 'テスト')

      expect(hook.current.fillSeconds).toBe(1800)
    })

    it('経過時間通知 ON ならその間隔（45分 → 2700）', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 45 })
      const hook = renderTimer()

      await startTimer(hook, 'テスト')

      expect(hook.current.fillSeconds).toBe(2700)
    })

    it('startMore でも設定を読む（60分 → 3600）', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 60 })
      const hook = renderTimer()

      await startMoreTimer(hook, existing())

      expect(hook.current.fillSeconds).toBe(3600)
    })

    it('設定の読み込みに失敗したら 1800', async () => {
      mockGetElapsedSettings.mockRejectedValue(new Error('read error'))
      const hook = renderTimer()

      await startTimer(hook, 'テスト')

      expect(hook.current.fillSeconds).toBe(1800)
    })

    it('設定の読み込みに失敗しても計測は始まる', async () => {
      mockGetElapsedSettings.mockRejectedValue(new Error('read error'))
      const hook = renderTimer()

      await startTimer(hook, 'テスト')

      expect(hook.current.isRunning).toBe(true)
    })

    it('前回の計測時ではなく、start した時点の設定を使う', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 45 })
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      act(() => { hook.current.cancel() })
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })

      await startTimer(hook, 'テスト2')

      expect(hook.current.fillSeconds).toBe(1800)
    })
  })

  describe('pause / resume', () => {
    async function runningFor(ms: number): Promise<Hook> {
      const hook = renderTimer()
      await startTimer(hook, 'test')
      advance(ms)
      return hook
    }

    it('pause すると isPaused になる', async () => {
      const hook = await runningFor(5000)

      act(() => { hook.current.pause() })

      expect(hook.current.isPaused).toBe(true)
    })

    it('一時停止中は elapsedSeconds が進まない', async () => {
      const hook = await runningFor(5000)
      act(() => { hook.current.pause() })

      advance(3000)

      expect(hook.current.elapsedSeconds).toBe(5)
    })

    it('resume すると isPaused が解ける', async () => {
      const hook = await runningFor(5000)
      act(() => { hook.current.pause() })

      act(() => { hook.current.resume() })

      expect(hook.current.isPaused).toBe(false)
    })

    it('resume すると一時停止前の続きから数える（一時停止中の時間は含めない）', async () => {
      const hook = await runningFor(5000)
      act(() => { hook.current.pause() })
      advance(3000)
      act(() => { hook.current.resume() })

      advance(2000)

      expect(hook.current.elapsedSeconds).toBe(7)
    })

    it('一時停止中に stop すると、一時停止前までの区間で保存する', async () => {
      const hook = await runningFor(5 * 60_000)
      act(() => { hook.current.pause() })
      advance(60 * 60_000) // 一時停止中に1時間経過

      const session = await stopTimer(hook)

      expect(session?.totalTime).toBe(5)
    })

    it('計測していなければ pause しても isPaused にならない', () => {
      const hook = renderTimer()

      act(() => { hook.current.pause() })

      expect(hook.current.isPaused).toBe(false)
    })
  })

  describe('adjustStartTime', () => {
    it('elapsedSeconds を新しい開始時刻からの経過に合わせる', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(10_000)

      act(() => { hook.current.adjustStartTime(new Date(Date.now() - 600_000)) })

      expect(hook.current.elapsedSeconds).toBe(600)
    })

    it('バックエンドへ新しい開始時刻を通知する', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      const newStart = new Date(Date.now() - 600_000)

      act(() => { hook.current.adjustStartTime(newStart) })

      expect(mockTimerAdjustStartTime).toHaveBeenCalledWith(newStart.getTime())
    })

    it('未来の時刻は無視する', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(10_000)

      act(() => { hook.current.adjustStartTime(new Date(Date.now() + 60_000)) })

      expect(hook.current.elapsedSeconds).toBe(10)
    })

    it('停止時の区間は新しい開始時刻から始まる', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(60_000)
      act(() => { hook.current.adjustStartTime(new Date('2026-02-27T09:30:00')) })

      const session = await stopTimer(hook)

      expect(session?.times[0].startTime).toBe('2026-02-27T09:30:00')
    })
  })

  describe('juiceSeconds（ジュース水位の周期リセット）', () => {
    it('start 直後は 0', async () => {
      const hook = renderTimer()

      await startTimer(hook, 'テスト')

      expect(hook.current.juiceSeconds).toBe(0)
    })

    it('startMore 直後も 0', async () => {
      const hook = renderTimer()

      await startMoreTimer(hook, existing({ totalTime: 25 }))

      expect(hook.current.juiceSeconds).toBe(0)
    })

    it('fillSeconds に届くまでは経過秒と同じだけ増える', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')

      advance(1799_000)

      expect(hook.current.juiceSeconds).toBe(1799)
    })

    it('fillSeconds（1800秒）経過で 0 に戻る', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(1799_000)

      advance(1000)

      expect(hook.current.juiceSeconds).toBe(0)
    })

    it('周期リセットしても elapsedSeconds は戻らない', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')

      advance(1800_000)

      expect(hook.current.elapsedSeconds).toBe(1800)
    })

    it('2周期目（3600秒）でも再び 0 に戻る', async () => {
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(3599_000)

      advance(1000)

      expect(hook.current.juiceSeconds).toBe(0)
    })

    it('経過時間通知 ON でも、通知イベントを待たずに周期リセットする（フォールバック）', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const hook = renderTimer()
      await startTimer(hook, 'テスト')

      advance(1800_000)

      expect(hook.current.juiceSeconds).toBe(0)
    })

    it('経過時間通知のイベントが来たら、周期の途中でも 0 に戻る', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(1799_000)

      act(() => { elapsedFiredCallback?.() })

      expect(hook.current.juiceSeconds).toBe(0)
    })

    it('通知イベントで 0 に戻っても elapsedSeconds は戻らない', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(1799_000)

      act(() => { elapsedFiredCallback?.() })

      expect(hook.current.elapsedSeconds).toBe(1799)
    })

    it('通知イベントで戻った位置から、次の周期を数え直す', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(1000_000)
      act(() => { elapsedFiredCallback?.() })

      advance(500_000)

      expect(hook.current.juiceSeconds).toBe(500)
    })

    it('停止後に通知イベントが来ても何も変わらない', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(60_000)
      await stopTimer(hook)

      act(() => { elapsedFiredCallback?.() })

      expect(hook.current.juiceSeconds).toBe(0)
    })

    it('開始時刻を修正すると、fillSeconds の倍数に合わせて周期の起点を置き直す', async () => {
      // 5000秒経過で起点は 3600。開始を「1000秒前」に直すと、起点を引きずると
      // max(0, 1000 - 3600) = 0 のまま次の境界まで固まる。置き直せば 1000 - (1000 % 1800) = 0 が起点
      const hook = renderTimer()
      await startTimer(hook, 'テスト')
      advance(5000_000)

      act(() => { hook.current.adjustStartTime(new Date(Date.now() - 1000_000)) })

      expect(hook.current.juiceSeconds).toBe(1000)
    })
  })

  it('アンマウントすると通知イベントの購読を解除する', () => {
    const { unmount } = renderHook(() => useTimer())

    unmount()

    expect(elapsedFiredCallback).toBeNull()
  })
})
