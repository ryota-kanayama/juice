// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { DailyDataProvider } from '../../daily/DailyDataContext'
import { CalendarWindow } from './CalendarWindow'

vi.stubGlobal('bridge', {
  getSessions: vi.fn().mockResolvedValue([]),
  updateSession: vi.fn().mockResolvedValue(undefined),
  getDailyMonth: vi.fn().mockResolvedValue({ version: 1, days: {} }),
  setDailyDay: vi.fn().mockResolvedValue(undefined),
  getHolidays: vi.fn().mockResolvedValue({}),
  onSessionsChanged: vi.fn(() => () => {}),
  onDailyChanged: vi.fn(() => () => {}),
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <DailyDataProvider>{children}</DailyDataProvider>
)

describe('CalendarWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0))
  })

  it('初期表示は週ビュー', async () => {
    render(<CalendarWindow />, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '週' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('ツールバーに期間見出しを出す', async () => {
    render(<CalendarWindow />, { wrapper })
    // ミニカレンダーの月見出しも同じ文字列「2026年8月」を出すため、
    // ツールバー側の <strong> 要素に絞り込んで検証する
    await waitFor(() => {
      expect(
        screen.getByText(
          (content, element) => element?.tagName.toLowerCase() === 'strong' && content === '2026年8月',
        ),
      ).toBeInTheDocument()
    })
  })

  it('サイドバーにミニカレンダーを出す', async () => {
    render(<CalendarWindow />, { wrapper })
    await waitFor(() => {
      // ミニカレンダーの前月/次月ボタン
      expect(screen.getByRole('button', { name: '前月' })).toBeInTheDocument()
    })
  })

  it('月ボタンで月ビューに切り替わる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CalendarWindow />, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '月' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '月' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '月' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('サイドバーに選択日の詳細を出す', async () => {
    render(<CalendarWindow />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('8月6日(木)')).toBeInTheDocument()
    })
  })
})

describe('CalendarWindow の戻るボタン', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0))
  })

  it('「戻る」を押すとポップオーバーへ戻るコマンドを呼ぶ', async () => {
    const backToMainPanel = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('bridge', {
      getSessions: vi.fn().mockResolvedValue([]),
      updateSession: vi.fn().mockResolvedValue(undefined),
      getDailyMonth: vi.fn().mockResolvedValue({ version: 1, days: {} }),
      setDailyDay: vi.fn().mockResolvedValue(undefined),
      getHolidays: vi.fn().mockResolvedValue({}),
      onSessionsChanged: vi.fn(() => () => {}),
      onDailyChanged: vi.fn(() => () => {}),
      backToMainPanel,
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<CalendarWindow />, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(backToMainPanel).toHaveBeenCalled()
  })

  it('週次分析ボタンはツールバーに置く', async () => {
    render(<CalendarWindow />, { wrapper })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '週次分析' })).toBeInTheDocument()
    })
  })
})
