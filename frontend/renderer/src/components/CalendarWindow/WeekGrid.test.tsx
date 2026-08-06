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

  it('ブロックの位置と高さがグリッド高さに対する割合で表される', () => {
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    // 8:00〜20:00 の12時間グリッド。10:00 開始 → 2/12、2時間ぶん → 2/12。
    // px ではなく割合で持つことで、ウィンドウ高さに応じて縦に伸びる
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(block.style.top).toMatch(/%$/)
    expect(block.style.height).toMatch(/%$/)
    expect(parseFloat(block.style.top)).toBeCloseTo((2 / 12) * 100, 3)
    expect(parseFloat(block.style.height)).toBeCloseTo((2 / 12) * 100, 3)
  })

  it('時間軸グリッドは固定高さを持たず、最低高さだけを持つ', () => {
    const { container } = render(<WeekGrid {...baseProps} />)
    // 高さを固定すると余った縦幅が空白になる。最低高さ（12時間 × 44px）だけを保証し、
    // それより広いときは親の高さいっぱいまで伸ばす
    const grid = container.querySelector('[data-time-grid]') as HTMLElement
    expect(grid).not.toBeNull()
    expect(grid.style.height).toBe('')
    expect(grid.style.minHeight).toBe('528px')
  })

  it('時刻ラベルもグリッド高さに対する割合で配置される', () => {
    const { container } = render(<WeekGrid {...baseProps} />)
    const label = screen.getByText('9:00')
    expect((label as HTMLElement).style.top).toMatch(/%$/)
    expect(parseFloat((label as HTMLElement).style.top)).toBeCloseTo((1 / 12) * 100, 3)
    expect(container.querySelector('[data-time-grid]')).not.toBeNull()
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
    expect(parseFloat(block.style.top)).toBe(0)
    // 8:00〜9:00 の1時間ぶんだけ見える
    expect(parseFloat(block.style.height)).toBeCloseTo((1 / 12) * 100, 3)
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
    // 1分ぶん(0.14%)ではなく、最低高さ 14px 相当（12時間 × 44px = 528px に対する割合）まで引き上げられる
    expect(parseFloat(block.style.height)).toBeCloseTo((14 / 528) * 100, 3)
  })

  it('最小高さを確保してもグリッド最下部を超えない', () => {
    const lastMinute = makeSession({
      times: [{ startTime: '2026-08-06T19:59:00', endTime: '2026-08-06T20:00:00' }],
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [lastMinute] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(parseFloat(block.style.top) + parseFloat(block.style.height)).toBeLessThanOrEqual(100)
  })
})
