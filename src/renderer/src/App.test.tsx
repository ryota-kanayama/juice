import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TimerPage } from './App'
import { DailyDataProvider } from './daily/DailyDataContext'
import type { SessionsState } from './hooks/useSessions'

// その日の DayRecord を返すよう getDailyMonth をスタブして勤怠状態を仕込む
const getDailyMonth = vi.fn().mockResolvedValue({ version: 1, days: {} })
vi.stubGlobal('electronAPI', {
  getSessions: vi.fn().mockResolvedValue([]),
  getDailyMonth,
  setDailyDay: vi.fn().mockResolvedValue(undefined),
  getBreakBehaviorSettings: vi.fn().mockResolvedValue({ behavior: 'stop' }),
  // updateRepository が呼ぶ IPC モック
  onUpdatePrepareQuit: vi.fn().mockReturnValue(() => {}),
  readyToQuit: vi.fn().mockResolvedValue(undefined),
})

function stubSessions(): SessionsState {
  return {
    today: '2026-06-10',
    todaySessions: [],
    upsertToday: vi.fn(),
    applyStartMore: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    startTelework: vi.fn(),
  }
}

function renderTimerPage() {
  return render(
    <DailyDataProvider>
      <TimerPage sessions={stubSessions()} />
    </DailyDataProvider>
  )
}

describe('TimerPage — 業務開始オーバーレイ', () => {
  beforeEach(() => {
    getDailyMonth.mockResolvedValue({ version: 1, days: {} })
  })

  it('業務開始前はオーバーレイを表示し、タイマー作成フォームを隠す', () => {
    renderTimerPage()
    expect(screen.getByRole('button', { name: '業務開始' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('どんなジュースにしますか？')).not.toBeInTheDocument()
  })

  it('業務開始済みならタイマー作成フォームを表示し、オーバーレイを隠す', async () => {
    getDailyMonth.mockResolvedValue({ version: 1, days: { '2026-06-10': { workStart: '09:00' } } })
    renderTimerPage()
    expect(await screen.findByPlaceholderText('どんなジュースにしますか？')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '業務開始' })).not.toBeInTheDocument()
    )
  })
})

describe('TimerPage — ツアーデモ', () => {
  it('tourDemo 時はダミーセッションを表示し業務開始ボタンを出さない', () => {
    render(
      <DailyDataProvider>
        <TimerPage sessions={stubSessions()} tourDemo />
      </DailyDataProvider>
    )
    expect(screen.getByText('資料作成')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '業務開始' })).not.toBeInTheDocument()
  })
})
