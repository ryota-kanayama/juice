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
      totalTime: 180,
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
      totalTime: 1,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [oneMinute] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    // 1分ぶん(0.14%)ではなく、最低高さ 18px 相当（12時間 × 44px = 528px に対する割合）まで引き上げられる
    expect(parseFloat(block.style.height)).toBeCloseTo((18 / 528) * 100, 3)
  })

  it('最小高さは作業名1行と padding・ボーダーが収まる大きさにする', () => {
    const oneMinute = makeSession({
      times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T10:01:00' }],
      totalTime: 1,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [oneMinute] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    // グリッド最小高さ 528px 換算での実寸
    const px = (parseFloat(block.style.height) / 100) * 528
    // 上下 padding 4px + 透明ボーダー 2px を引いた残りが、9px・leading-tight の
    // 行ボックス（約 11.25px）以上あること
    expect(px - 4 - 2).toBeGreaterThanOrEqual(11.25)
  })

  it('最小高さを確保してもグリッド最下部を超えない', () => {
    const lastMinute = makeSession({
      times: [{ startTime: '2026-08-06T19:59:00', endTime: '2026-08-06T20:00:00' }],
      totalTime: 1,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [lastMinute] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(parseFloat(block.style.top) + parseFloat(block.style.height)).toBeLessThanOrEqual(100)
  })
})

describe('WeekGrid の時刻なし帯', () => {
  it('区間を持たないセッションは帯に出る', () => {
    const untimed = makeSession({ times: [], totalTime: 45 })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [untimed] }} />
    )
    const chip = container.querySelector('[data-untimed-chip]')
    expect(chip).not.toBeNull()
    expect(chip?.textContent).toContain('レビュー')
  })

  it('区間を持たないセッションはグリッドに描かない', () => {
    const untimed = makeSession({ times: [], totalTime: 45 })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [untimed] }} />
    )
    expect(container.querySelectorAll('[data-event-block]')).toHaveLength(0)
  })

  it('区間の合計が totalTime と食い違うセッションは帯に出る', () => {
    const mismatched = makeSession({
      times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T10:01:00' }],
      totalTime: 65,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [mismatched] }} />
    )
    expect(container.querySelectorAll('[data-untimed-chip]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-event-block]')).toHaveLength(0)
  })

  it('合計が一致するセッションはグリッドに描く', () => {
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    expect(container.querySelectorAll('[data-untimed-chip]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-event-block]')).toHaveLength(1)
  })

  it('稼働中の区間を持つセッションはグリッドに残す', () => {
    const running = makeSession({
      times: [{ startTime: '2026-08-06T10:00:00', endTime: null }],
      totalTime: 0,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [running] }} />
    )
    expect(container.querySelectorAll('[data-untimed-chip]')).toHaveLength(0)
  })

  it('該当が1件も無ければ帯を描かない', () => {
    const { container } = render(<WeekGrid {...baseProps} />)
    expect(container.querySelector('[data-untimed-row]')).toBeNull()
  })

  it('チップをダブルクリックすると onEditSession が呼ばれる', async () => {
    const onEditSession = vi.fn()
    const untimed = makeSession({ times: [], totalTime: 45 })
    const { container } = render(
      <WeekGrid
        {...baseProps}
        sessionsByDate={{ '2026-08-06': [untimed] }}
        onEditSession={onEditSession}
      />
    )
    const chip = container.querySelector('[data-untimed-chip]') as HTMLElement
    await userEvent.dblClick(chip)
    expect(onEditSession).toHaveBeenCalledWith(untimed)
  })
})

describe('WeekGrid の重なり配置', () => {
  it('重ならない記録は全幅で描く', () => {
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(parseFloat(block.style.left)).toBeCloseTo(0, 3)
    expect(parseFloat(block.style.width)).toBeCloseTo(100, 3)
  })

  it('重なる2件は左右に分かれる', () => {
    const a = makeSession({
      id: 'a', taskId: 'a',
      times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T12:00:00' }],
      totalTime: 120,
    })
    const b = makeSession({
      id: 'b', taskId: 'b',
      times: [{ startTime: '2026-08-06T11:00:00', endTime: '2026-08-06T13:00:00' }],
      totalTime: 120,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [a, b] }} />
    )
    const blocks = Array.from(container.querySelectorAll('[data-event-block]')) as HTMLElement[]
    expect(blocks).toHaveLength(2)
    const lefts = blocks.map(el => parseFloat(el.style.left)).sort((x, y) => x - y)
    expect(lefts[0]).toBeCloseTo(0, 3)
    expect(lefts[1]).toBeCloseTo(50, 3)
    for (const el of blocks) expect(parseFloat(el.style.width)).toBeCloseTo(50, 3)
  })

  it('1セッションの複数区間も重なれば横に分かれる', () => {
    const multi = makeSession({
      times: [
        { startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T12:00:00' },
        { startTime: '2026-08-06T11:00:00', endTime: '2026-08-06T13:00:00' },
      ],
      totalTime: 240,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [multi] }} />
    )
    const blocks = Array.from(container.querySelectorAll('[data-event-block]')) as HTMLElement[]
    expect(blocks).toHaveLength(2)
    expect(new Set(blocks.map(el => el.style.left)).size).toBe(2)
  })

  it('別の日の記録は互いの配置に影響しない', () => {
    const a = makeSession({
      id: 'a', taskId: 'a', date: '2026-08-05',
      times: [{ startTime: '2026-08-05T10:00:00', endTime: '2026-08-05T12:00:00' }],
      totalTime: 120,
    })
    const b = makeSession({
      id: 'b', taskId: 'b',
      times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T12:00:00' }],
      totalTime: 120,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-05': [a], '2026-08-06': [b] }} />
    )
    const blocks = Array.from(container.querySelectorAll('[data-event-block]')) as HTMLElement[]
    expect(blocks).toHaveLength(2)
    for (const el of blocks) expect(parseFloat(el.style.width)).toBeCloseTo(100, 3)
  })
})

describe('WeekGrid のホバー詳細', () => {
  it('ブロックにカーソルを合わせると作業名と時刻が出る', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    await user.hover(block)
    // makeSession は 10:00–12:00 / 120分 / レビュー / P001 / 開発
    expect(await screen.findByText('10:00 – 12:00')).toBeInTheDocument()
    expect(screen.getByText('120分')).toBeInTheDocument()
    expect(screen.getByText('P001')).toBeInTheDocument()
  })

  it('時刻なし帯のチップにカーソルを合わせても詳細が出る', async () => {
    const user = userEvent.setup()
    const untimed = makeSession({ times: [], totalTime: 45 })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [untimed] }} />
    )
    const chip = container.querySelector('[data-untimed-chip]') as HTMLElement
    await user.hover(chip)
    expect(await screen.findByText('45分')).toBeInTheDocument()
  })

  it('グリッド範囲をはみ出す区間は、クリップ後ではなく記録そのものの時刻と長さを出す', async () => {
    const user = userEvent.setup()
    // 18:00–22:00（240分）。グリッドは 8:00〜20:00 までしか描かないため、
    // 表示上は 20:00 でクリップされるが、ツールチップには記録そのものの時刻・長さを出す
    const overnight = makeSession({
      times: [{ startTime: '2026-08-06T18:00:00', endTime: '2026-08-06T22:00:00' }],
      totalTime: 240,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [overnight] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    await user.hover(block)
    expect(await screen.findByText('18:00 – 22:00')).toBeInTheDocument()
    expect(screen.getByText('240分')).toBeInTheDocument()
  })
})

describe('WeekGrid のブロックの余白', () => {
  it('時間が連続するブロックが接して見えないよう上下に余白を入れる', () => {
    const morning = makeSession({
      id: 'a', taskId: 'a',
      times: [{ startTime: '2026-08-06T10:00:00', endTime: '2026-08-06T11:00:00' }],
      totalTime: 60,
    })
    const noon = makeSession({
      id: 'b', taskId: 'b',
      times: [{ startTime: '2026-08-06T11:00:00', endTime: '2026-08-06T12:00:00' }],
      totalTime: 60,
    })
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [morning, noon] }} />
    )
    const blocks = Array.from(container.querySelectorAll('[data-event-block]')) as HTMLElement[]
    expect(blocks).toHaveLength(2)
    for (const el of blocks) {
      expect(el.style.borderTopWidth).toBe('1px')
      expect(el.style.borderBottomWidth).toBe('1px')
      expect(el.style.borderTopColor).toBe('transparent')
      expect(el.style.borderBottomColor).toBe('transparent')
    }
  })

  it('左右の余白は維持する', () => {
    const { container } = render(
      <WeekGrid {...baseProps} sessionsByDate={{ '2026-08-06': [makeSession()] }} />
    )
    const block = container.querySelector('[data-event-block]') as HTMLElement
    expect(block.style.borderLeftWidth).toBe('2px')
    expect(block.style.borderRightWidth).toBe('2px')
  })
})
