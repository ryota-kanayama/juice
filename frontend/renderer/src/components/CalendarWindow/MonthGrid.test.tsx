// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthGrid } from './MonthGrid'
import type { Session } from '../../types/session'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1', taskId: 's1', name: 'レビュー', projectCode: 'P001', workCategory: '開発',
    times: [], date: '2026-08-06', color: '#FF9500', totalTime: 120,
    ...overrides,
  }
}

const baseProps = {
  anchorDate: '2026-08-06',
  sessionsByDate: {} as Record<string, Session[]>,
  selectedDate: '2026-08-06',
  holidays: {},
  onSelectDate: vi.fn(),
}

describe('MonthGrid', () => {
  it('日〜土の曜日見出しを表示する', () => {
    render(<MonthGrid {...baseProps} />)
    for (const d of ['日', '月', '火', '水', '木', '金', '土']) {
      expect(screen.getByText(d)).toBeInTheDocument()
    }
  })

  it('その月の全日のセルを描画する', () => {
    render(<MonthGrid {...baseProps} />)
    expect(screen.getByRole('button', { name: /8月1日/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /8月31日/ })).toBeInTheDocument()
  })

  it('セルをクリックすると onSelectDate が呼ばれる', async () => {
    const onSelectDate = vi.fn()
    render(<MonthGrid {...baseProps} onSelectDate={onSelectDate} />)
    await userEvent.click(screen.getByRole('button', { name: /8月4日/ }))
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-04')
  })

  it('セッションを作業名と時間のチップで表示する', () => {
    render(
      <MonthGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    expect(screen.getByText('レビュー')).toBeInTheDocument()
    expect(screen.getByText('120分')).toBeInTheDocument()
  })

  it('4件以上あるときは3件+「他N件」を出す', () => {
    const sessions = [
      makeSession({ id: 'a', name: 'A' }),
      makeSession({ id: 'b', name: 'B' }),
      makeSession({ id: 'c', name: 'C' }),
      makeSession({ id: 'd', name: 'D' }),
      makeSession({ id: 'e', name: 'E' }),
    ]
    render(<MonthGrid {...baseProps} sessionsByDate={{ '2026-08-06': sessions }} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.queryByText('D')).toBeNull()
    expect(screen.getByText('他2件')).toBeInTheDocument()
  })

  it('選択中の日は aria-pressed が true', () => {
    render(<MonthGrid {...baseProps} selectedDate="2026-08-06" />)
    expect(screen.getByRole('button', { name: /8月6日/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /8月5日/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('祝日には data-holiday が付く', () => {
    const { container } = render(
      <MonthGrid {...baseProps} holidays={{ '2026-08-11': '山の日' }} />
    )
    expect(container.querySelector('[data-holiday="2026-08-11"]')).not.toBeNull()
  })

  it('6週固定で前月・翌月の日付を薄く表示する', () => {
    // 2026年8月は1日(土)始まり・31日(月)終わりなので、前月末(7/26-31)と翌月頭(9/1-5)が
    // 空白セルを埋める形で表示され、6週=42セル固定になる
    const { container } = render(<MonthGrid {...baseProps} />)

    const prevCell = container.querySelector('[data-outside-month="2026-07-31"]')
    expect(prevCell).not.toBeNull()
    expect(prevCell).toHaveAttribute('aria-label', expect.stringContaining('7月31日'))
    expect(prevCell?.querySelector('span')?.className).toContain('opacity-40')

    const nextCell = container.querySelector('[data-outside-month="2026-09-01"]')
    expect(nextCell).not.toBeNull()
    expect(nextCell).toHaveAttribute('aria-label', expect.stringContaining('9月1日'))
    expect(nextCell?.querySelector('span')?.className).toContain('opacity-40')

    // 当月のセルには data-outside-month が付かない
    expect(container.querySelector('[data-outside-month="2026-08-06"]')).toBeNull()

    // 常に42セル(6週)固定
    expect(container.querySelectorAll('button')).toHaveLength(42)
  })

  it('前月・翌月のセルもクリックで選択でき、記録があればチップを表示する', async () => {
    const onSelectDate = vi.fn()
    render(
      <MonthGrid
        {...baseProps}
        onSelectDate={onSelectDate}
        sessionsByDate={{ '2026-07-31': [makeSession({ date: '2026-07-31' })] }}
      />
    )
    const prevCell = screen.getByRole('button', { name: /7月31日/ })
    expect(prevCell.textContent).toContain('レビュー')
    await userEvent.click(prevCell)
    expect(onSelectDate).toHaveBeenCalledWith('2026-07-31')
  })
})
