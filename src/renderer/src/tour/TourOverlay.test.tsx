import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourOverlay } from './TourOverlay'
import type { TourState } from './useTour'

function makeTour(overrides: Partial<TourState> = {}): TourState {
  return {
    isActive: true,
    index: 0,
    total: 7,
    step: { target: null, title: 'ようこそ', body: '案内します' },
    isLast: false,
    start: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    skip: vi.fn(),
    finish: vi.fn(),
    ...overrides,
  }
}

describe('TourOverlay', () => {
  it('非アクティブなら何も描画しない', () => {
    const { container } = render(<TourOverlay tour={makeTour({ isActive: false })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('現在ステップの文言と進捗を表示する', () => {
    render(<TourOverlay tour={makeTour()} />)
    expect(screen.getByText('ようこそ')).toBeInTheDocument()
    expect(screen.getByText('案内します')).toBeInTheDocument()
    expect(screen.getByText('1 / 7')).toBeInTheDocument()
  })

  it('「次へ」で next、「スキップ」で skip を呼ぶ', async () => {
    const tour = makeTour()
    const user = userEvent.setup()
    render(<TourOverlay tour={tour} />)
    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(tour.next).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'スキップ' }))
    expect(tour.skip).toHaveBeenCalled()
  })

  it('先頭では「戻る」を出さない', () => {
    render(<TourOverlay tour={makeTour({ index: 0 })} />)
    expect(screen.queryByRole('button', { name: '戻る' })).not.toBeInTheDocument()
  })

  it('最終ステップでは「はじめる」を出し finish を呼ぶ', async () => {
    const tour = makeTour({ index: 6, isLast: true })
    const user = userEvent.setup()
    render(<TourOverlay tour={tour} />)
    await user.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(tour.finish).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument()
  })
})
