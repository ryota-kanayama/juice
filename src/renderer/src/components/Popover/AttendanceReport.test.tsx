// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DailyDataProvider } from '../../daily/DailyDataContext'
import { AttendanceReport } from './AttendanceReport'
import type { Session } from '../../types/session'
import { attendanceRepository } from '../../repositories/attendanceRepository'

vi.mock('../../repositories/attendanceRepository', () => ({
  attendanceRepository: { send: vi.fn().mockResolvedValue({ ok: true, status: 200, body: '{}' }) },
}))

vi.stubGlobal('electronAPI', {
  getDailyMonth: vi.fn().mockResolvedValue({
    version: 1,
    days: {
      '2026-06-12': { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 },
    },
  }),
  setDailyDay: vi.fn().mockResolvedValue(undefined),
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <DailyDataProvider>{children}</DailyDataProvider>
)

function makeSession(): Session {
  return {
    id: '1', taskId: '1', name: '作業', projectCode: 'P', workCategory: 'C',
    times: [{ startTime: '2026-06-12T10:00:00', endTime: '2026-06-12T11:00:00' }],
    date: '2026-06-12', color: '#FF9500', totalTime: 60,
  }
}

describe('AttendanceReport — 表示行', () => {
  it('出勤・退勤・休憩が表示される', async () => {
    render(<AttendanceReport sessions={[makeSession()]} today="2026-06-12" />, { wrapper })
    expect(await screen.findByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
    expect(screen.getByText('60分')).toBeInTheDocument()
  })

  it('出勤をダブルクリックするとダイアログが開く', async () => {
    render(<AttendanceReport sessions={[makeSession()]} today="2026-06-12" />, { wrapper })
    const startValue = await screen.findByText('09:00')
    fireEvent.dblClick(startValue)
    expect(await screen.findByText('出勤時刻')).toBeInTheDocument()
  })

  it('退勤をダブルクリックするとダイアログが開く', async () => {
    render(<AttendanceReport sessions={[makeSession()]} today="2026-06-12" />, { wrapper })
    const endValue = await screen.findByText('18:00')
    fireEvent.dblClick(endValue)
    expect(await screen.findByText('退勤時刻')).toBeInTheDocument()
  })

  it('休憩をダブルクリックするとダイアログが開く', async () => {
    render(<AttendanceReport sessions={[makeSession()]} today="2026-06-12" />, { wrapper })
    const breakValue = await screen.findByText('60分')
    fireEvent.dblClick(breakValue)
    expect(await screen.findByText('休憩時間')).toBeInTheDocument()
  })

  it('コピー・送るボタンに data-tour が付く', async () => {
    const { container } = render(<AttendanceReport sessions={[makeSession()]} today="2026-06-12" />, { wrapper })
    await screen.findByText('09:00')
    expect(container.querySelector('[data-tour="att-copy"]')).not.toBeNull()
    expect(container.querySelector('[data-tour="att-send"]')).not.toBeNull()
  })
})

describe('AttendanceReport — 0分タスクの送信確認', () => {
  beforeEach(() => {
    vi.mocked(attendanceRepository.send).mockClear()
  })

  // 実労働 480分（09:00〜18:00 − 休憩60分）。タイマー合計 510分 → 超過30分で
  // 末尾タスクが 0 分になる。
  function overageSessions(): Session[] {
    return [
      { id: '1', taskId: '1', name: '設計', projectCode: 'P', workCategory: 'C',
        times: [], date: '2026-06-12', color: '#FF9500', totalTime: 480 },
      { id: '2', taskId: '2', name: 'レビュー', projectCode: 'P', workCategory: 'C',
        times: [], date: '2026-06-12', color: '#FF9500', totalTime: 30 },
    ]
  }

  it('超過時の送るボタンは「調整して送る」になる', async () => {
    render(<AttendanceReport sessions={overageSessions()} today="2026-06-12" />, { wrapper })
    expect(await screen.findByText('調整して送る')).toBeInTheDocument()
  })

  it('0分タスクを含む送信は確認ダイアログを出し、確定で送信する', async () => {
    const { container } = render(<AttendanceReport sessions={overageSessions()} today="2026-06-12" />, { wrapper })
    const sendBtn = container.querySelector('[data-tour="att-send"]') as HTMLElement
    await screen.findByText('調整して送る')
    fireEvent.click(sendBtn)
    // この時点ではまだ送信されない
    expect(attendanceRepository.send).not.toHaveBeenCalled()
    // 確認ダイアログが出る
    expect(await screen.findByText('0分のタスクが含まれています。本当に送信しますか？')).toBeInTheDocument()
    // 確定で送信
    fireEvent.click(screen.getByRole('button', { name: '送信' }))
    expect(attendanceRepository.send).toHaveBeenCalledTimes(1)
  })

  it('確認ダイアログをキャンセルすると送信しない', async () => {
    const { container } = render(<AttendanceReport sessions={overageSessions()} today="2026-06-12" />, { wrapper })
    const sendBtn = container.querySelector('[data-tour="att-send"]') as HTMLElement
    await screen.findByText('調整して送る')
    fireEvent.click(sendBtn)
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(attendanceRepository.send).not.toHaveBeenCalled()
  })
})
