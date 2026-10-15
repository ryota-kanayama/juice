// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { MiniCalendar } from './MiniCalendar'

// 2026年8月は 8/1(土) 始まり。前月 7/26〜31 と翌月 9/1〜5 で6週を埋める
type Props = ComponentProps<typeof MiniCalendar>

function renderCalendar(props: Partial<Props> = {}) {
  return render(
    <MiniCalendar
      anchorDate="2026-08-06"
      selectedDate="2026-08-06"
      sessionDates={new Set()}
      holidays={{}}
      onSelectDate={vi.fn()}
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      {...props}
    />,
  )
}

const day = (label: string) => screen.getByRole('button', { name: label })

describe('MiniCalendar', () => {
  describe('見出し', () => {
    it('年月を出す', () => {
      renderCalendar()

      expect(screen.getByText('2026年8月')).toBeInTheDocument()
    })

    it('日〜土の曜日を出す', () => {
      renderCalendar()

      expect(['日', '月', '火', '水', '木', '金', '土'].map(d => screen.getByText(d))).toHaveLength(7)
    })

    it('「前月」で onPrevMonth を呼ぶ', async () => {
      const onPrevMonth = vi.fn()
      renderCalendar({ onPrevMonth })

      await userEvent.click(day('前月'))

      expect(onPrevMonth).toHaveBeenCalledOnce()
    })

    it('「次月」で onNextMonth を呼ぶ', async () => {
      const onNextMonth = vi.fn()
      renderCalendar({ onNextMonth })

      await userEvent.click(day('次月'))

      expect(onNextMonth).toHaveBeenCalledOnce()
    })
  })

  describe('日付', () => {
    it('常に6週（42日）を出す', () => {
      renderCalendar()

      expect(screen.getAllByRole('button', { name: /月\d+日$/ })).toHaveLength(42)
    })

    it('その月の1日から末日まで出す', () => {
      renderCalendar()

      expect(day('8月1日')).toBeInTheDocument()
      expect(day('8月31日')).toBeInTheDocument()
    })

    it('前月・翌月の日付に月外の印を付ける', () => {
      const { container } = renderCalendar()

      const marked = ['2026-07-26', '2026-07-31', '2026-09-01'].map(d => container.querySelector(`[data-outside-month="${d}"]`))

      expect(marked.every(Boolean)).toBe(true)
    })

    it('当月の日付には月外の印を付けない', () => {
      const { container } = renderCalendar()

      expect(container.querySelector('[data-outside-month="2026-08-06"]')).toBeNull()
    })

    it('押すとその日を選ぶ', async () => {
      const onSelectDate = vi.fn()
      renderCalendar({ onSelectDate })

      await userEvent.click(day('8月4日'))

      expect(onSelectDate).toHaveBeenCalledWith('2026-08-04')
    })

    it('前月の日付も押せば選べる', async () => {
      const onSelectDate = vi.fn()
      renderCalendar({ onSelectDate })

      await userEvent.click(day('7月26日'))

      expect(onSelectDate).toHaveBeenCalledWith('2026-07-26')
    })

    it('選択中の日だけ押された状態にする', () => {
      renderCalendar({ selectedDate: '2026-08-06' })

      expect(day('8月6日')).toHaveAttribute('aria-pressed', 'true')
      expect(day('8月5日')).toHaveAttribute('aria-pressed', 'false')
    })

    it('記録がある日にだけ点を付ける', () => {
      const { container } = renderCalendar({ sessionDates: new Set(['2026-08-04']) })

      expect(container.querySelectorAll('[data-session-dot]')).toHaveLength(1)
      expect(container.querySelector('[data-session-dot="2026-08-04"]')).not.toBeNull()
    })

    it('祝日に印を付ける', () => {
      const { container } = renderCalendar({ holidays: { '2026-08-11': '山の日' } })

      expect(container.querySelector('[data-holiday="2026-08-11"]')).not.toBeNull()
    })
  })

  describe('週のハイライト', () => {
    it('highlightWeekOf を含む日曜〜土曜に帯の印を付ける', () => {
      const { container } = renderCalendar({ highlightWeekOf: '2026-08-06' })

      const inWeek = Array.from(container.querySelectorAll('[data-in-week]')).map(el => el.getAttribute('data-in-week'))

      expect(inWeek).toEqual(['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'])
    })

    it('週が月をまたぐときは、前月のセルにも途切れず付ける', () => {
      // 2026-07-29(水) の週は 7/26(日)〜8/1(土)
      const { container } = renderCalendar({ highlightWeekOf: '2026-07-29' })

      expect(container.querySelector('[data-outside-month="2026-07-26"]')).toHaveAttribute('data-in-week', '2026-07-26')
      expect(container.querySelector('[data-in-week="2026-08-01"]')).not.toBeNull()
    })

    it('highlightWeekOf が無ければ帯を付けない', () => {
      const { container } = renderCalendar()

      expect(container.querySelector('[data-in-week]')).toBeNull()
    })
  })
})
