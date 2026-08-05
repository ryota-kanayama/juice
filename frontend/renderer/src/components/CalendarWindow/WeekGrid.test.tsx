// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekGrid } from './WeekGrid'
import type { Session } from '../../types/session'

const DATES = [
  '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
  '2026-08-06', '2026-08-07', '2026-08-08',
]

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1', taskId: 's1', name: 'レビュー', projectCode: 'P001', workCategory: '開発',
    times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T12:00:00' }],
    date: '2026-08-06', color: '#FF9500', totalTime: 120,
    ...overrides,
  }
}

const baseProps = {
  dates: DATES,
  sessionsByDate: {} as Record<string, Session[]>,
  selectedDate: '2026-08-06',
  holidays: {},
  onSelectDate: vi.fn(),
}

describe('WeekGrid', () => {
  it('日〜土の7日分の列見出しを描画する', () => {
    render(<WeekGrid {...baseProps} />)
    expect(screen.getByRole('button', { name: '8月2日 日曜日' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '8月8日 土曜日' })).toBeInTheDocument()
  })

  it('列見出しをクリックすると onSelectDate が呼ばれる', async () => {
    const onSelectDate = vi.fn()
    render(<WeekGrid {...baseProps} onSelectDate={onSelectDate} />)
    await userEvent.click(screen.getByRole('button', { name: '8月4日 火曜日' }))
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-04')
  })

  it('時刻ラベルを描画する', () => {
    render(<WeekGrid {...baseProps} />)
    expect(screen.getByText('9:00')).toBeInTheDocument()
    expect(screen.getByText('17:00')).toBeInTheDocument()
  })

  it('区間をブロックとして描画する', () => {
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    const block = container.querySelector('[data-event-block]')
    expect(block).not.toBeNull()
    expect(block?.textContent).toContain('レビュー')
  })

  it('ブロックの位置と高さが時刻から計算される', () => {
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    // 8:00 起点・1時間44px。10:00 開始 → top=88px、2時間 → height=88px
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(block.style.top).toBe('88px')
    expect(block.style.height).toBe('88px')
  })

  it('1セッションの複数区間はそれぞれ別ブロックになる', () => {
    const multi = makeSession({
      times: [
        { startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T11:00:00' },
        { startTime: '2026-08-06T13:00:00', endTime: '2026-08-06T14:00:00' },
      ],
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [multi] }} />
    )
    expect(container.querySelectorAll('[data-event-block]')).toHaveLength(2)
  })

  it('稼働中（endTime が null）の区間は描画しない', () => {
    const running = makeSession({
      times: [{ startTime: '2026-08-06T10:00:00', endTime: null }],
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [running] }} />
    )
    expect(container.querySelectorAll('[data-event-block]')).toHaveLength(0)
  })

  it('表示範囲より早い区間は上端でクリップされる', () => {
    const early = makeSession({
      times: [{ startTime: '2026-08-06T06:00:00', endTime: '2026-08-06T09:00:00' }],
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [early] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(block.style.top).toBe('0px')
    // 8:00〜9:00 の1時間ぶんだけ見える
    expect(block.style.height).toBe('44px')
  })

  it('選択中の日の列に data-selected が付く', () => {
    const { container } = render(<WeekGrid {...baseProps} selectedDate="2026-08-06" />)
    expect(container.querySelector('[data-selected="2026-08-06"]')).not.toBeNull()
    expect(container.querySelector('[data-selected="2026-08-04"]')).toBeNull()
  })

  it('1分の記録でも最小高さが確保される', () => {
    const oneMinute = makeSession({
      times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T10:01:00' }],
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [oneMinute] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(parseFloat(block.style.height)).toBeGreaterThanOrEqual(14)
  })
})
