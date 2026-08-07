// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MiniCalendar } from './MiniCalendar'

const baseProps = {
  anchorDate: '2026-08-06',
  selectedDate: '2026-08-06',
  sessionDates: new Set<string>(),
  holidays: {},
  onSelectDate: vi.fn(),
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
}

describe('MiniCalendar', () => {
  it('年月見出しを表示する', () => {
    render(<MiniCalendar {...baseProps} />)
    expect(screen.getByText('2026年8月')).toBeInTheDocument()
  })

  it('日〜土の曜日見出しを表示する', () => {
    render(<MiniCalendar {...baseProps} />)
    for (const d of ['日', '月', '火', '水', '木', '金', '土']) {
      expect(screen.getByText(d)).toBeInTheDocument()
    }
  })

  it('その月の日数分のセルを描画する', () => {
    render(<MiniCalendar {...baseProps} />)
    // 2026年8月は31日
    expect(screen.getByRole('button', { name: '8月1日' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '8月31日' })).toBeInTheDocument()
  })

  it('日付をクリックすると onSelectDate が呼ばれる', async () => {
    const onSelectDate = vi.fn()
    render(<MiniCalendar {...baseProps} onSelectDate={onSelectDate} />)
    await userEvent.click(screen.getByRole('button', { name: '8月4日' }))
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-04')
  })

  it('選択中の日は aria-pressed が true', () => {
    render(<MiniCalendar {...baseProps} selectedDate="2026-08-06" />)
    expect(screen.getByRole('button', { name: '8月6日' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '8月5日' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('記録がある日にはドットを出す', () => {
    const { container } = render(
      <MiniCalendar {...baseProps} sessionDates={new Set(['2026-08-04'])} />
    )
    expect(container.querySelector('[data-session-dot="2026-08-04"]')).not.toBeNull()
    expect(container.querySelector('[data-session-dot="2026-08-05"]')).toBeNull()
  })

  it('highlightWeekOf の週に data-in-week が付く', () => {
    const { container } = render(
      <MiniCalendar {...baseProps} highlightWeekOf="2026-08-06" />
    )
    // 2026-08-02(日)〜2026-08-08(土)
    expect(container.querySelector('[data-in-week="2026-08-02"]')).not.toBeNull()
    expect(container.querySelector('[data-in-week="2026-08-08"]')).not.toBeNull()
    expect(container.querySelector('[data-in-week="2026-08-09"]')).toBeNull()
  })

  it('前月・次月ボタンでコールバックが呼ばれる', async () => {
    const onPrevMonth = vi.fn()
    const onNextMonth = vi.fn()
    render(<MiniCalendar {...baseProps} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} />)
    await userEvent.click(screen.getByRole('button', { name: '前月' }))
    await userEvent.click(screen.getByRole('button', { name: '次月' }))
    expect(onPrevMonth).toHaveBeenCalled()
    expect(onNextMonth).toHaveBeenCalled()
  })

  it('祝日には holiday 属性が付く', () => {
    const { container } = render(
      <MiniCalendar {...baseProps} holidays={{ '2026-08-11': '山の日' }} />
    )
    expect(container.querySelector('[data-holiday="2026-08-11"]')).not.toBeNull()
  })
})

describe('MiniCalendar の前後月', () => {
  it('常に6週ぶん(42セル)の日付ボタンを描く', () => {
    render(<MiniCalendar {...baseProps} />)
    // 2026年8月は 8/1(土) 始まりなので、前月 7/26〜7/31 と翌月 9/1〜9/5 で埋まる
    expect(screen.getAllByRole('button', { name: /月\d+日$/ })).toHaveLength(42)
  })

  it('前月の日付を出す', () => {
    const { container } = render(<MiniCalendar {...baseProps} />)
    expect(container.querySelector('[data-outside-month="2026-07-26"]')).not.toBeNull()
    expect(container.querySelector('[data-outside-month="2026-07-31"]')).not.toBeNull()
  })

  it('翌月の日付を出す', () => {
    const { container } = render(<MiniCalendar {...baseProps} />)
    expect(container.querySelector('[data-outside-month="2026-09-01"]')).not.toBeNull()
  })

  it('表示中の月の日付には data-outside-month を付けない', () => {
    const { container } = render(<MiniCalendar {...baseProps} />)
    expect(container.querySelector('[data-outside-month="2026-08-06"]')).toBeNull()
  })

  it('前後月の日付を押しても onSelectDate は呼ばれる', async () => {
    const onSelectDate = vi.fn()
    render(<MiniCalendar {...baseProps} onSelectDate={onSelectDate} />)
    await userEvent.click(screen.getByRole('button', { name: '7月26日' }))
    expect(onSelectDate).toHaveBeenCalledWith('2026-07-26')
  })

  it('highlightWeekOf の週が月をまたぐとき、前月のセルにも帯が途切れず付く', () => {
    const { container } = render(
      <MiniCalendar {...baseProps} highlightWeekOf="2026-07-29" />
    )
    // 2026-07-29(水) を含む週は 7/26(日)〜8/1(土)。7/26〜7/31 は前月（アウトサイド）のセル
    const outsideCell = container.querySelector('[data-outside-month="2026-07-26"]')
    expect(outsideCell).not.toBeNull()
    expect(outsideCell).toHaveAttribute('data-in-week', '2026-07-26')
    expect(container.querySelector('[data-in-week="2026-08-01"]')).not.toBeNull()
  })
})
