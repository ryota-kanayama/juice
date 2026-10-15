import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { TimerPage } from './App'
import { DailyDataProvider } from './daily/DailyDataContext'
import type { SessionsState } from './hooks/useSessions'
import type { DayRecord } from '../../shared/types'
import { makeSession } from './test/factories'

const TODAY = '2026-06-10'

const getDailyMonth = vi.fn()
const saveSession = vi.fn()
const updateSession = vi.fn()
const setDailyDay = vi.fn()
const getBreakBehaviorSettings = vi.fn()
const readyToQuit = vi.fn()
const onUpdatePrepareQuit = vi.fn()
let prepareQuit: (() => void) | null = null

vi.stubGlobal('bridge', {
  getSessions: vi.fn().mockResolvedValue([]),
  saveSession,
  updateSession,
  getDailyMonth,
  setDailyDay,
  onDailyChanged: () => () => {},
  getBreakBehaviorSettings,
  getElapsedSettings: vi.fn().mockResolvedValue({ enabled: false, minutes: 30 }),
  onElapsedNotificationFired: () => () => {},
  timerStarted: vi.fn().mockResolvedValue(undefined),
  timerStopped: vi.fn().mockResolvedValue(undefined),
  onUpdatePrepareQuit,
  readyToQuit,
  openCalendarWindow: vi.fn().mockResolvedValue(undefined),
})

function stubSessions(todaySessions: SessionsState['todaySessions'] = []): SessionsState {
  return {
    today: TODAY,
    todaySessions,
    upsertToday: vi.fn(),
    applyStartMore: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    startTelework: vi.fn(),
  }
}

/** 今日の勤務記録を用意して描画し、読み込みを待つ */
async function renderTimerPage(day?: DayRecord, props: { tourDemo?: boolean; todaySessions?: SessionsState['todaySessions'] } = {}) {
  const { todaySessions, ...pageProps } = props
  getDailyMonth.mockResolvedValue({ version: 1, days: day ? { [TODAY]: day } : {} })
  const view = render(<DailyDataProvider><TimerPage sessions={stubSessions(todaySessions)} {...pageProps} /></DailyDataProvider>)
  await act(async () => {})
  return view
}

/** 業務開始済みの状態で作業名を入れて「注ぐ」 */
async function startTimer(name = 'テスト作業'): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText('どんなジュースにしますか？'), { target: { value: name } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '注ぐ' })) })
}

async function firePrepareQuit(): Promise<void> {
  await act(async () => { prepareQuit!() })
}

beforeEach(() => {
  getDailyMonth.mockReset()
  getBreakBehaviorSettings.mockReset().mockResolvedValue({ behavior: 'stop' })
  saveSession.mockReset().mockResolvedValue(undefined)
  updateSession.mockReset().mockResolvedValue(undefined)
  setDailyDay.mockReset().mockResolvedValue(undefined)
  readyToQuit.mockReset().mockResolvedValue(undefined)
  prepareQuit = null
  onUpdatePrepareQuit.mockReset().mockImplementation((cb: () => void) => {
    prepareQuit = cb
    return () => { if (prepareQuit === cb) prepareQuit = null }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TimerPage', () => {
  describe('業務開始前', () => {
    it('業務開始のオーバーレイを出す', async () => {
      await renderTimerPage()

      expect(screen.getByRole('button', { name: '業務開始' })).toBeInTheDocument()
    })

    it('タイマーの入力欄は隠す', async () => {
      await renderTimerPage()

      expect(screen.queryByPlaceholderText('どんなジュースにしますか？')).not.toBeInTheDocument()
    })
  })

  describe('業務開始後', () => {
    it('タイマーの入力欄を出す', async () => {
      await renderTimerPage({ workStart: '09:00' })

      expect(screen.getByPlaceholderText('どんなジュースにしますか？')).toBeInTheDocument()
    })

    it('業務開始のオーバーレイは出さない', async () => {
      await renderTimerPage({ workStart: '09:00' })

      expect(screen.queryByRole('button', { name: '業務開始' })).not.toBeInTheDocument()
    })

    it('「注ぐ」で計測中の表示に切り替える', async () => {
      await renderTimerPage({ workStart: '09:00' })

      await startTimer('テスト作業')

      expect(screen.getByRole('button', { name: 'やめる' })).toBeInTheDocument()
    })
  })

  describe('休憩中のタイマー画面', () => {
    /** 休憩時の動作を設定し、計測中の画面で「休憩」を押す。`now` を渡すと休憩の開始時刻がその時刻になる */
    async function startBreakWhileRunning(behavior: 'pause' | 'stop', now = new Date(`${TODAY}T12:00:00`)): Promise<void> {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(now)
      getBreakBehaviorSettings.mockResolvedValue({ behavior })
      await renderTimerPage({ workStart: '09:00' })
      await startTimer('休憩をはさむ作業')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '休憩' })) })
    }

    describe('休憩時の動作が「一時停止」', () => {
      it('休憩を始めると「休憩終了」を出す', async () => {
        await startBreakWhileRunning('pause')

        expect(screen.getByRole('button', { name: '休憩終了' })).toBeInTheDocument()
      })

      it('休憩を始めても「やめる」は出し続ける', async () => {
        await startBreakWhileRunning('pause')

        expect(screen.getByRole('button', { name: 'やめる' })).toBeInTheDocument()
      })

      it('「休憩終了」を押すと、その時刻を休憩終了として記録する', async () => {
        await startBreakWhileRunning('pause')
        vi.setSystemTime(new Date(`${TODAY}T12:30:00`))

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '休憩終了' })) })

        expect(setDailyDay).toHaveBeenCalledWith(TODAY, { breakEnd: '12:30' })
      })

      it('休憩を終えると、休憩ボタン（「休憩」「休憩終了」とも）は出さない', async () => {
        await startBreakWhileRunning('pause')

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '休憩終了' })) })

        expect(screen.queryAllByRole('button', { name: /^休憩/ })).toEqual([])
      })
    })

    describe('休憩していないとき', () => {
      it('計測中は「休憩」を出す', async () => {
        getBreakBehaviorSettings.mockResolvedValue({ behavior: 'pause' })
        await renderTimerPage({ workStart: '09:00' })

        await startTimer('休憩前の作業')

        expect(screen.getByRole('button', { name: '休憩' })).toBeInTheDocument()
      })
    })

    describe('休憩時の動作が「停止」', () => {
      it('休憩を始めると、計測を止めてタイマー画面を閉じる', async () => {
        await startBreakWhileRunning('stop')

        expect(screen.queryByRole('button', { name: 'やめる' })).not.toBeInTheDocument()
      })

      it('休憩を始めると、勤務時間バーの「休憩終了」を出す', async () => {
        await startBreakWhileRunning('stop')

        expect(screen.getByRole('button', { name: '休憩終了' })).toBeInTheDocument()
      })
    })
  })

  describe('ツアーのデモ', () => {
    it('ダミーのセッションを出す', async () => {
      await renderTimerPage(undefined, { tourDemo: true })

      expect(screen.getByText('資料作成')).toBeInTheDocument()
    })

    it('業務開始のオーバーレイは出さない', async () => {
      await renderTimerPage(undefined, { tourDemo: true })

      expect(screen.queryByRole('button', { name: '業務開始' })).not.toBeInTheDocument()
    })
  })

  describe('終了直前（prepare-quit）', () => {
    it('計測していなければ、そのまま準備完了を返す', async () => {
      await renderTimerPage({ workStart: '09:00' })

      await firePrepareQuit()

      expect(readyToQuit).toHaveBeenCalledOnce()
    })

    it('計測中なら、計測を保存してから準備完了を返す', async () => {
      const order: string[] = []
      saveSession.mockImplementation(async () => { order.push('save') })
      readyToQuit.mockImplementation(async () => { order.push('ready') })
      await renderTimerPage({ workStart: '09:00' })
      await startTimer()

      await firePrepareQuit()

      expect(order).toEqual(['save', 'ready'])
    })

    it('保存に失敗しても準備完了は返す（更新を止めない）', async () => {
      saveSession.mockRejectedValue(new Error('disk full'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderTimerPage({ workStart: '09:00' })
      await startTimer()

      await firePrepareQuit()

      expect(readyToQuit).toHaveBeenCalledOnce()
    })

    it('計測していなければ、何も保存しない', async () => {
      await renderTimerPage({ workStart: '09:00' })

      await firePrepareQuit()

      expect(saveSession).not.toHaveBeenCalled()
    })

    it('購読後に開始した計測を、その作業名で保存する', async () => {
      await renderTimerPage({ workStart: '09:00' })
      await startTimer('購読後に開始した作業')

      await firePrepareQuit()

      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ name: '購読後に開始した作業' }))
    })

    it('再描画しても購読を張り直さない', async () => {
      const view = await renderTimerPage({ workStart: '09:00' })

      view.rerender(<DailyDataProvider><TimerPage sessions={stubSessions()} /></DailyDataProvider>)
      await act(async () => {})

      expect(onUpdatePrepareQuit).toHaveBeenCalledOnce()
    })

    it('再描画しても購読を解除しない', async () => {
      const unsubscribe = vi.fn()
      onUpdatePrepareQuit.mockReset().mockReturnValue(unsubscribe)
      const view = await renderTimerPage({ workStart: '09:00' })

      view.rerender(<DailyDataProvider><TimerPage sessions={stubSessions()} /></DailyDataProvider>)
      await act(async () => {})

      expect(unsubscribe).not.toHaveBeenCalled()
    })

    // 計測中は1秒ごとに再描画されるため、購読の張り直しの隙間に届いたイベントを取りこぼしていた（#125）
    it('計測中に時間が進んでも購読を張り直さない', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
      await renderTimerPage({ workStart: '09:00' })
      const subscriptions = onUpdatePrepareQuit.mock.calls.length
      await startTimer()

      act(() => { vi.advanceTimersByTime(3000) })

      expect(onUpdatePrepareQuit.mock.calls.length).toBe(subscriptions)
    })

    it('計測の開始と停止をまたいでも購読を張り直さない', async () => {
      await renderTimerPage({ workStart: '09:00' })
      const subscriptions = onUpdatePrepareQuit.mock.calls.length
      await startTimer()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'やめる' })) })

      expect(onUpdatePrepareQuit.mock.calls.length).toBe(subscriptions)
    })

    it('アンマウントすると購読を解除する', async () => {
      const unsubscribe = vi.fn()
      onUpdatePrepareQuit.mockReset().mockReturnValue(unsubscribe)
      const view = await renderTimerPage({ workStart: '09:00' })

      view.unmount()

      expect(unsubscribe).toHaveBeenCalledOnce()
    })

    it('一時停止中でも、計測した区間を保存する', async () => {
      getBreakBehaviorSettings.mockResolvedValue({ behavior: 'pause' })
      await renderTimerPage({ workStart: '09:00' })
      await startTimer('一時停止中の作業')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '休憩' })) })

      await firePrepareQuit()

      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ name: '一時停止中の作業' }))
    })

    it('「追加で注ぐ」で続けた計測を、その PJコード・作業区分のまま保存する', async () => {
      const previous = makeSession({
        name: '続きの作業',
        projectCode: 'PJ-9',
        workCategory: '設計',
        date: TODAY,
        times: [{ startTime: `${TODAY}T09:00:00`, endTime: `${TODAY}T09:30:00` }],
      })
      await renderTimerPage({ workStart: '09:00' }, { todaySessions: [previous] })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '追加で注ぐ' })) })

      await firePrepareQuit()

      expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({ projectCode: 'PJ-9', workCategory: '設計' }))
    })

    it('準備完了の通知が失敗しても、未処理の拒否を出さない', async () => {
      readyToQuit.mockRejectedValue(new Error('ipc closed'))
      const onUnhandled = vi.fn()
      process.on('unhandledRejection', onUnhandled)
      await renderTimerPage({ workStart: '09:00' })

      await firePrepareQuit()
      await new Promise(resolve => setTimeout(resolve, 0))
      process.off('unhandledRejection', onUnhandled)

      expect(onUnhandled).not.toHaveBeenCalled()
    })
  })
})
