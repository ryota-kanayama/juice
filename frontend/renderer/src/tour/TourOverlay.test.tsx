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

const button = (name: string) => screen.queryByRole('button', { name })

describe('TourOverlay', () => {
  it('ツアー中でなければ何も描画しない', () => {
    const { container } = render(<TourOverlay tour={makeTour({ isActive: false })} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('現在のステップのタイトルと本文を表示する', () => {
    render(<TourOverlay tour={makeTour()} />)

    expect(screen.getByText('ようこそ')).toBeInTheDocument()
    expect(screen.getByText('案内します')).toBeInTheDocument()
  })

  it('進み具合を「現在 / 全体」で表示する', () => {
    render(<TourOverlay tour={makeTour({ index: 2, total: 7 })} />)

    expect(screen.getByText('3 / 7')).toBeInTheDocument()
  })

  it.each([
    ['次へ', 'next'],
    ['スキップ', 'skip'],
  ] as const)('「%s」で %s を呼ぶ', async (label, method) => {
    const tour = makeTour()
    render(<TourOverlay tour={tour} />)

    await userEvent.click(button(label)!)

    expect(tour[method]).toHaveBeenCalledOnce()
  })

  it('最初のステップでは「戻る」を出さない', () => {
    render(<TourOverlay tour={makeTour({ index: 0 })} />)

    expect(button('戻る')).not.toBeInTheDocument()
  })

  it('2つ目以降のステップでは「戻る」で prev を呼ぶ', async () => {
    const tour = makeTour({ index: 1 })
    render(<TourOverlay tour={tour} />)

    await userEvent.click(button('戻る')!)

    expect(tour.prev).toHaveBeenCalledOnce()
  })

  it('最後のステップでは「次へ」の代わりに「はじめる」を出す', () => {
    render(<TourOverlay tour={makeTour({ index: 6, isLast: true })} />)

    expect(button('次へ')).not.toBeInTheDocument()
  })

  it('最後のステップの「はじめる」で finish を呼ぶ', async () => {
    const tour = makeTour({ index: 6, isLast: true })
    render(<TourOverlay tour={tour} />)

    await userEvent.click(button('はじめる')!)

    expect(tour.finish).toHaveBeenCalledOnce()
  })
})
