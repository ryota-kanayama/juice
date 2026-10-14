import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { TimerPage } from './App'
import { DailyDataProvider } from './daily/DailyDataContext'
import type { SessionsState } from './hooks/useSessions'
import type { DayRecord } from '../../shared/types'

const TODAY = '2026-06-10'

const getDailyMonth = vi.fn()
const saveSession = vi.fn()
const readyToQuit = vi.fn()
const onUpdatePrepareQuit = vi.fn()
let prepareQuit: (() => void) | null = null

vi.stubGlobal('bridge', {
  getSessions: vi.fn().mockResolvedValue([]),
  saveSession,
  updateSession: vi.fn().mockResolvedValue(undefined),
  getDailyMonth,
  setDailyDay: vi.fn().mockResolvedValue(undefined),
  onDailyChanged: () => () => {},
  getBreakBehaviorSettings: vi.fn().mockResolvedValue({ behavior: 'stop' }),
  getElapsedSettings: vi.fn().mockResolvedValue({ enabled: false, minutes: 30 }),
  onElapsedNotificationFired: () => () => {},
  timerStarted: vi.fn().mockResolvedValue(undefined),
  timerStopped: vi.fn().mockResolvedValue(undefined),
  onUpdatePrepareQuit,
  readyToQuit,
  openCalendarWindow: vi.fn().mockResolvedValue(undefined),
})

function stubSessions(): SessionsState {
  return {
    today: TODAY,
    todaySessions: [],
    upsertToday: vi.fn(),
    applyStartMore: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    startTelework: vi.fn(),
  }
}

/** 今日の勤務記録を用意して描画し、読み込みを待つ */
async function renderTimerPage(day?: DayRecord, props: { tourDemo?: boolean } = {}) {
  getDailyMonth.mockResolvedValue({ version: 1, days: day ? { [TODAY]: day } : {} })
  const view = render(<DailyDataProvider><TimerPage sessions={stubSessions()} {...props} /></DailyDataProvider>)
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
  saveSession.mockReset().mockResolvedValue(undefined)
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

  describe('更新の適用直前（prepare-quit）', () => {
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

    // 既知の不具合（#125）: 購読の依存に毎レンダー作り直される ts を渡しているため、
    // 計測中は1秒ごとに購読を張り直している。張り直しの隙間に届いたイベントは取りこぼす。
    // 直ったら it.fails を外す
    it.fails('計測中に時間が進んでも購読を張り直さない', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
      await renderTimerPage({ workStart: '09:00' })
      await startTimer()
      const subscriptions = onUpdatePrepareQuit.mock.calls.length

      act(() => { vi.advanceTimersByTime(3000) })

      expect(onUpdatePrepareQuit.mock.calls.length).toBe(subscriptions)
    })
  })
})
