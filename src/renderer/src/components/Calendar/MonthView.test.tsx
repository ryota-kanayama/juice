import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthView } from './MonthView'

describe('MonthView', () => {
  it('月のタイトルを表示する', () => {
    render(
      <MonthView
        year={2026}
        month={2}
        sessionDates={[]}
        selectedDate={null}
        onSelectDate={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />
    )
    expect(screen.getByText('2026年 2月')).toBeInTheDocument()
  })

  it('日付をクリックするとonSelectDateが呼ばれる', async () => {
    const onSelectDate = vi.fn()
    render(
      <MonthView
        year={2026}
        month={2}
        sessionDates={[]}
        selectedDate={null}
        onSelectDate={onSelectDate}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />
    )
    // 15日をクリック
    const buttons = screen.getAllByRole('button')
    const day15 = buttons.find(b => b.textContent?.includes('15'))
    if (day15) await userEvent.click(day15)
    expect(onSelectDate).toHaveBeenCalledWith('2026-02-15')
  })

  it('前月ボタンと次月ボタンが存在する', () => {
    render(
      <MonthView
        year={2026}
        month={2}
        sessionDates={[]}
        selectedDate={null}
        onSelectDate={vi.fn()}
        onPrevMonth={vi.fn()}
        onNextMonth={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '←' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '→' })).toBeInTheDocument()
  })
})
