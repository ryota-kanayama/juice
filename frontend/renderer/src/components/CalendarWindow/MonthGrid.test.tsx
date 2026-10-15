// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { MonthGrid } from './MonthGrid'
import type { Session } from '../../types/session'
import { makeSession } from '../../test/factories'

// 2026年8月は 8/1(土) 始まり・8/31(月) 終わり。前月 7/26〜31 と翌月 9/1〜5 で6週を埋める
const ANCHOR = '2026-08-06'

const record = (overrides: Partial<Session> = {}): Session =>
  makeSession({ name: 'レビュー', date: ANCHOR, times: [], totalTime: 120, ...overrides })

type Props = ComponentProps<typeof MonthGrid>

function renderGrid(props: Partial<Props> = {}) {
  return render(
    <MonthGrid anchorDate={ANCHOR} sessionsByDate={{}} selectedDate={ANCHOR} holidays={{}} onSelectDate={vi.fn()} {...props} />,
  )
}

const cell = (name: RegExp) => screen.getByRole('button', { name })

describe('MonthGrid', () => {
  describe('セル', () => {
    it('日〜土の曜日見出しを出す', () => {
      renderGrid()

      expect(['日', '月', '火', '水', '木', '金', '土'].map(d => screen.getByText(d))).toHaveLength(7)
    })

    it('常に6週（42セル）を描く', () => {
      const { container } = renderGrid()

      expect(container.querySelectorAll('button')).toHaveLength(42)
    })

    it('その月の1日から末日まで出す', () => {
      renderGrid()

      expect(cell(/^8月1日/)).toBeInTheDocument()
      expect(cell(/^8月31日/)).toBeInTheDocument()
    })

    it('前月・翌月の日付は月外の印を付けて薄く出す', () => {
      const { container } = renderGrid()

      const outside = ['2026-07-31', '2026-09-01'].map(d => container.querySelector(`[data-outside-month="${d}"] span`))

      expect(outside.every(span => span?.classList.contains('opacity-40'))).toBe(true)
    })

    it('当月の日付には月外の印を付けない', () => {
      const { container } = renderGrid()

      expect(container.querySelector(`[data-outside-month="${ANCHOR}"]`)).toBeNull()
    })

    it('祝日に印を付ける', () => {
      const { container } = renderGrid({ holidays: { '2026-08-11': '山の日' } })

      expect(container.querySelector('[data-holiday="2026-08-11"]')).not.toBeNull()
    })

    it('選択中の日だけ押された状態にする', () => {
      renderGrid({ selectedDate: ANCHOR })

      expect(cell(/^8月6日/)).toHaveAttribute('aria-pressed', 'true')
      expect(cell(/^8月5日/)).toHaveAttribute('aria-pressed', 'false')
    })

    it('押すとその日を選ぶ', async () => {
      const onSelectDate = vi.fn()
      renderGrid({ onSelectDate })

      await userEvent.click(cell(/^8月4日/))

      expect(onSelectDate).toHaveBeenCalledWith('2026-08-04')
    })

    it('前月の日付も押せば選べる', async () => {
      const onSelectDate = vi.fn()
      renderGrid({ onSelectDate })

      await userEvent.click(cell(/^7月31日/))

      expect(onSelectDate).toHaveBeenCalledWith('2026-07-31')
    })
  })

  describe('記録のチップ', () => {
    it('作業名と時間を出す', () => {
      renderGrid({ sessionsByDate: { [ANCHOR]: [record()] } })

      expect(screen.getByText('レビュー')).toBeInTheDocument()
      expect(screen.getByText('120分')).toBeInTheDocument()
    })

    it('記録がある日は、読み上げ名に「記録あり」を添える', () => {
      renderGrid({ sessionsByDate: { [ANCHOR]: [record()] } })

      expect(cell(/^8月6日（記録あり）$/)).toBeInTheDocument()
    })

    it('前月の日付でも記録があればチップを出す', () => {
      renderGrid({ sessionsByDate: { '2026-07-31': [record({ date: '2026-07-31' })] } })

      expect(cell(/^7月31日/).textContent).toContain('レビュー')
    })

    it('3件までならすべて出し、「他N件」は出さない', () => {
      const sessions = ['A', 'B', 'C'].map(name => record({ id: name, name }))

      renderGrid({ sessionsByDate: { [ANCHOR]: sessions } })

      expect(screen.queryByText(/^他\d+件$/)).not.toBeInTheDocument()
    })

    it('4件以上なら3件だけ出し、残りを「他N件」にまとめる', () => {
      const sessions = ['A', 'B', 'C', 'D', 'E'].map(name => record({ id: name, name }))

      renderGrid({ sessionsByDate: { [ANCHOR]: sessions } })

      expect(screen.queryByText('D')).not.toBeInTheDocument()
      expect(screen.getByText('他2件')).toBeInTheDocument()
    })
  })
})
