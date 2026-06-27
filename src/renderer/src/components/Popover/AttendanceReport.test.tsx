// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DailyDataProvider } from '../../daily/DailyDataContext'
import { AttendanceReport } from './AttendanceReport'
import type { Session } from '../../types/session'

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
