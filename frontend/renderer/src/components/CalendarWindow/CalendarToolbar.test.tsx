// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarToolbar } from './CalendarToolbar'

const baseProps = {
  view: 'week' as const,
  periodLabel: '2026年8月',
  onToday: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onChangeView: vi.fn(),
}

describe('CalendarToolbar', () => {
  it('期間見出しを表示する', () => {
    render(<CalendarToolbar {...baseProps} />)
    expect(screen.getByText('2026年8月')).toBeInTheDocument()
  })

  it('月をまたぐ期間見出しもそのまま表示する', () => {
    render(<CalendarToolbar {...baseProps} periodLabel="2026年8月 – 9月" />)
    expect(screen.getByText('2026年8月 – 9月')).toBeInTheDocument()
  })

  it('今日ボタンで onToday が呼ばれる', async () => {
    const onToday = vi.fn()
    render(<CalendarToolbar {...baseProps} onToday={onToday} />)
    await userEvent.click(screen.getByRole('button', { name: '今日' }))
    expect(onToday).toHaveBeenCalled()
  })

  it('前へ・次へで各コールバックが呼ばれる', async () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(<CalendarToolbar {...baseProps} onPrev={onPrev} onNext={onNext} />)
    await userEvent.click(screen.getByRole('button', { name: '前へ' }))
    await userEvent.click(screen.getByRole('button', { name: '次へ' }))
    expect(onPrev).toHaveBeenCalled()
    expect(onNext).toHaveBeenCalled()
  })

  it('月ボタンで month に切り替える', async () => {
    const onChangeView = vi.fn()
    render(<CalendarToolbar {...baseProps} onChangeView={onChangeView} />)
    await userEvent.click(screen.getByRole('button', { name: '月' }))
    expect(onChangeView).toHaveBeenCalledWith('month')
  })

  it('週ボタンで week に切り替える', async () => {
    const onChangeView = vi.fn()
    render(<CalendarToolbar {...baseProps} view="month" onChangeView={onChangeView} />)
    await userEvent.click(screen.getByRole('button', { name: '週' }))
    expect(onChangeView).toHaveBeenCalledWith('week')
  })

  it('現在のビューは aria-pressed が true', () => {
    render(<CalendarToolbar {...baseProps} view="week" />)
    expect(screen.getByRole('button', { name: '週' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '月' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('CalendarToolbar の週次分析ボタン', () => {
  it('週次分析ボタンを表示し、押すと onOpenAnalysis が呼ばれる', async () => {
    const onOpenAnalysis = vi.fn()
    render(<CalendarToolbar {...baseProps} onOpenAnalysis={onOpenAnalysis} />)
    await userEvent.click(screen.getByRole('button', { name: '週次分析' }))
    expect(onOpenAnalysis).toHaveBeenCalled()
  })

  it('週次分析ボタンは月・週の切替ボタンより左に置く', () => {
    render(<CalendarToolbar {...baseProps} onOpenAnalysis={vi.fn()} />)
    const analysis = screen.getByRole('button', { name: '週次分析' })
    const month = screen.getByRole('button', { name: '月' })
    // DOCUMENT_POSITION_FOLLOWING(4) が立っていれば analysis が month より前にある
    expect(analysis.compareDocumentPosition(month) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
