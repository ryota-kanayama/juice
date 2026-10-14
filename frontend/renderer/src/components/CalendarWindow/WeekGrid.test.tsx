// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { WeekGrid } from './WeekGrid'
import type { Session } from '../../types/session'
import { interval, makeSession } from '../../test/factories'

const DATES = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08']
const DAY = '2026-08-06'

// グリッドは 8:00〜20:00 の12時間。最低高さは 12時間 × 44px = 528px
const GRID_MIN_PX = 528
const hourPct = (hours: number) => (hours / 12) * 100

/** DAY の hh:mm〜hh:mm の記録（合計は区間と一致させる） */
const at = (start: string, end: string, overrides: Partial<Session> = {}): Session => {
  const minutes = (Number(end.slice(0, 2)) * 60 + Number(end.slice(3))) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)))
  return makeSession({
    name: 'レビュー',
    projectCode: 'P001',
    workCategory: '開発',
    date: DAY,
    times: [interval(`${DAY}T${start}:00`, `${DAY}T${end}:00`)],
    totalTime: minutes,
    ...overrides,
  })
}

type Props = ComponentProps<typeof WeekGrid>

function renderGrid(props: Partial<Props> = {}) {
  return render(
    <WeekGrid dates={DATES} sessionsByDate={{}} selectedDate={DAY} holidays={{}} onSelectDate={vi.fn()} {...props} />,
  )
}

function renderDay(sessions: Session[], props: Partial<Props> = {}) {
  return renderGrid({ sessionsByDate: { [DAY]: sessions }, ...props })
}

const blocks = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[data-event-block]'))
const chips = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[data-untimed-chip]'))
const num = (value: string) => parseFloat(value)

describe('WeekGrid', () => {
  describe('列見出し', () => {
    it('日曜から土曜まで7日分を出す', () => {
      renderGrid()

      expect(screen.getAllByRole('button', { name: /月\d+日 .曜日$/ })).toHaveLength(7)
    })

    it('押すとその日を選ぶ', async () => {
      const onSelectDate = vi.fn()
      renderGrid({ onSelectDate })

      await userEvent.click(screen.getByRole('button', { name: '8月4日 火曜日' }))

      expect(onSelectDate).toHaveBeenCalledWith('2026-08-04')
    })

    it('選択中の日は押された状態にする', () => {
      renderGrid({ selectedDate: DAY })

      expect(screen.getByRole('button', { name: '8月6日 木曜日' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('選択中の日の列に印を付ける', () => {
      const { container } = renderGrid({ selectedDate: DAY })

      expect(container.querySelector(`[data-selected="${DAY}"]`)).not.toBeNull()
      expect(container.querySelector('[data-selected="2026-08-04"]')).toBeNull()
    })
  })

  describe('時間軸', () => {
    it('毎時の時刻を出す', () => {
      renderGrid()

      expect(screen.getByText('9:00')).toBeInTheDocument()
      expect(screen.getByText('17:00')).toBeInTheDocument()
    })

    it('時刻はグリッド高さに対する割合で置く（9:00 は 1/12）', () => {
      renderGrid()

      expect(screen.getByText('9:00').style.top).toBe(`${Number(hourPct(1).toFixed(4))}%`)
    })

    it('グリッドは高さを固定せず、最低高さだけを持つ（広ければ縦に伸びる）', () => {
      const { container } = renderGrid()

      const grid = container.querySelector<HTMLElement>('[data-time-grid]')!

      expect(grid.style.height).toBe('')
      expect(grid.style.minHeight).toBe(`${GRID_MIN_PX}px`)
    })
  })

  describe('記録のブロック', () => {
    it('作業名入りのブロックとして描く', () => {
      const { container } = renderDay([at('10:00', '12:00')])

      expect(blocks(container).map(b => b.textContent)).toEqual([expect.stringContaining('レビュー')])
    })

    it('位置と高さはグリッド高さに対する割合（10:00〜12:00 → 上から 2/12、高さ 2/12）', () => {
      const { container } = renderDay([at('10:00', '12:00')])

      const [block] = blocks(container)

      expect(num(block.style.top)).toBeCloseTo(hourPct(2), 3)
      expect(num(block.style.height)).toBeCloseTo(hourPct(2), 3)
    })

    it('1セッションの複数の区間はそれぞれ別のブロックにする', () => {
      const multi = makeSession({
        date: DAY,
        times: [interval(`${DAY}T10:00:00`, `${DAY}T11:00:00`), interval(`${DAY}T13:00:00`, `${DAY}T14:00:00`)],
        totalTime: 120,
      })

      const { container } = renderDay([multi])

      expect(blocks(container)).toHaveLength(2)
    })

    it('計測中の区間は描かない', () => {
      const running = makeSession({ date: DAY, times: [interval(`${DAY}T10:00:00`, null)], totalTime: 0 })

      const { container } = renderDay([running])

      expect(blocks(container)).toHaveLength(0)
    })

    it('表示範囲より前に始まる区間は上端で切る（6:00〜9:00 → 8:00〜9:00 だけ見える）', () => {
      const { container } = renderDay([at('06:00', '09:00')])

      const [block] = blocks(container)

      expect(num(block.style.top)).toBe(0)
      expect(num(block.style.height)).toBeCloseTo(hourPct(1), 3)
    })

    it('表示範囲の外だけの区間は描かない', () => {
      const { container } = renderDay([at('06:00', '07:30')])

      expect(blocks(container)).toHaveLength(0)
    })

    describe('短い記録', () => {
      it('1分でも最低高さ（18px 相当）を確保する', () => {
        const { container } = renderDay([at('10:00', '10:01')])

        expect(num(blocks(container)[0].style.height)).toBeCloseTo((18 / GRID_MIN_PX) * 100, 3)
      })

      it('最低高さは、作業名1行（約11.25px）と padding 4px・ボーダー 2px が収まる大きさ', () => {
        const { container } = renderDay([at('10:00', '10:01')])

        const px = (num(blocks(container)[0].style.height) / 100) * GRID_MIN_PX

        expect(px - 4 - 2).toBeGreaterThanOrEqual(11.25)
      })

      it('最低高さを確保してもグリッドの下端を超えない', () => {
        const { container } = renderDay([at('19:59', '20:00')])

        const [block] = blocks(container)

        expect(num(block.style.top) + num(block.style.height)).toBeLessThanOrEqual(100)
      })

      it('低いブロックには時刻を出さず、作業名だけにする', () => {
        const { container } = renderDay([at('10:00', '10:15')])

        expect(blocks(container)[0].textContent).not.toContain('10:00')
      })

      it('十分な高さのブロックには時刻も出す', () => {
        const { container } = renderDay([at('10:00', '12:00')])

        expect(blocks(container)[0].textContent).toContain('10:00–12:00')
      })
    })

    describe('余白', () => {
      it('時間が続くブロック同士が接して見えないよう、上下に透明な 1px の枠を付ける', () => {
        const { container } = renderDay([at('10:00', '11:00', { id: 'a' }), at('11:00', '12:00', { id: 'b' })])

        const styles = blocks(container).map(b => [b.style.borderTopWidth, b.style.borderBottomWidth, b.style.borderTopColor])

        expect(styles).toEqual([['1px', '1px', 'transparent'], ['1px', '1px', 'transparent']])
      })

      it('左右には 2px の余白を残す', () => {
        const { container } = renderDay([at('10:00', '12:00')])

        const [block] = blocks(container)

        expect([block.style.borderLeftWidth, block.style.borderRightWidth]).toEqual(['2px', '2px'])
      })
    })
  })

  describe('重なりの配置', () => {
    it('重ならない記録は全幅で描く', () => {
      const { container } = renderDay([at('10:00', '12:00')])

      const [block] = blocks(container)

      expect([num(block.style.left), num(block.style.width)]).toEqual([0, 100])
    })

    it('重なる2件は左右半分ずつに分ける', () => {
      const { container } = renderDay([at('10:00', '12:00', { id: 'a' }), at('11:00', '13:00', { id: 'b' })])

      const placements = blocks(container).map(b => [num(b.style.left), num(b.style.width)]).sort()

      expect(placements).toEqual([[0, 50], [50, 50]])
    })

    it('1セッションの複数の区間も、重なれば横に分ける', () => {
      const multi = makeSession({
        date: DAY,
        times: [interval(`${DAY}T10:00:00`, `${DAY}T12:00:00`), interval(`${DAY}T11:00:00`, `${DAY}T13:00:00`)],
        totalTime: 240,
      })

      const { container } = renderDay([multi])

      expect(new Set(blocks(container).map(b => b.style.left)).size).toBe(2)
    })

    it('別の日の記録は互いの配置に影響しない', () => {
      const other = at('10:00', '12:00', { id: 'a', date: '2026-08-05', times: [interval('2026-08-05T10:00:00', '2026-08-05T12:00:00')] })

      const { container } = renderGrid({ sessionsByDate: { '2026-08-05': [other], [DAY]: [at('10:00', '12:00', { id: 'b' })] } })

      expect(blocks(container).map(b => num(b.style.width))).toEqual([100, 100])
    })
  })

  describe('時刻なし帯', () => {
    it('区間を持たないセッションは帯にチップで出す', () => {
      const { container } = renderDay([makeSession({ name: 'レビュー', date: DAY, times: [], totalTime: 45 })])

      expect(chips(container).map(c => c.textContent)).toEqual([expect.stringContaining('レビュー')])
    })

    it('区間を持たないセッションはグリッドに描かない', () => {
      const { container } = renderDay([makeSession({ date: DAY, times: [], totalTime: 45 })])

      expect(blocks(container)).toHaveLength(0)
    })

    it('区間の合計が totalTime と食い違うセッションは帯に出し、グリッドには描かない', () => {
      const mismatched = at('10:00', '10:01', { totalTime: 65 })

      const { container } = renderDay([mismatched])

      expect([chips(container).length, blocks(container).length]).toEqual([1, 0])
    })

    it('合計が区間と一致するセッションは帯に出さない', () => {
      const { container } = renderDay([at('10:00', '12:00')])

      expect(chips(container)).toHaveLength(0)
    })

    it('計測中の区間を持つセッションは帯に出さない', () => {
      const running = makeSession({ date: DAY, times: [interval(`${DAY}T10:00:00`, null)], totalTime: 0 })

      const { container } = renderDay([running])

      expect(chips(container)).toHaveLength(0)
    })

    it('該当が無ければ帯ごと描かない', () => {
      const { container } = renderGrid()

      expect(container.querySelector('[data-untimed-row]')).toBeNull()
    })

    it('チップをダブルクリックすると、そのセッションの編集を開く', async () => {
      const onEditSession = vi.fn()
      const untimed = makeSession({ date: DAY, times: [], totalTime: 45 })
      const { container } = renderDay([untimed], { onEditSession })

      await userEvent.dblClick(chips(container)[0])

      expect(onEditSession).toHaveBeenCalledWith(untimed)
    })
  })

  describe('カーソルを合わせたときの詳細', () => {
    it('ブロックでは時刻・長さ・PJコードを出す', async () => {
      const { container } = renderDay([at('10:00', '12:00')])

      await userEvent.hover(blocks(container)[0])

      expect(await screen.findByText('10:00 – 12:00')).toBeInTheDocument()
      expect(screen.getByText('120分')).toBeInTheDocument()
      expect(screen.getByText('P001')).toBeInTheDocument()
    })

    it('時刻なし帯のチップでは合計を出す', async () => {
      const { container } = renderDay([makeSession({ date: DAY, times: [], totalTime: 45 })])

      await userEvent.hover(chips(container)[0])

      expect(await screen.findByText('45分')).toBeInTheDocument()
    })

    it('表示範囲をはみ出す区間は、切った後ではなく記録そのものの時刻と長さを出す', async () => {
      // 18:00〜22:00 はグリッド上は 20:00 で切れるが、詳細には記録どおりを出す
      const { container } = renderDay([at('18:00', '22:00')])

      await userEvent.hover(blocks(container)[0])

      expect(await screen.findByText('18:00 – 22:00')).toBeInTheDocument()
      expect(screen.getByText('240分')).toBeInTheDocument()
    })
  })
})
