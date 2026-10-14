// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { CalendarToolbar } from './CalendarToolbar'

type Props = ComponentProps<typeof CalendarToolbar>

function renderToolbar(props: Partial<Props> = {}) {
  return render(
    <CalendarToolbar
      view="week"
      periodLabel="2026年8月"
      onToday={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onChangeView={vi.fn()}
      {...props}
    />,
  )
}

const button = (name: string) => screen.getByRole('button', { name })

describe('CalendarToolbar', () => {
  it('渡された期間の見出しをそのまま出す', () => {
    renderToolbar({ periodLabel: '2026年8月 – 9月' })

    expect(screen.getByText('2026年8月 – 9月')).toBeInTheDocument()
  })

  it.each([
    ['今日', 'onToday'],
    ['前へ', 'onPrev'],
    ['次へ', 'onNext'],
  ] as const)('「%s」で %s を呼ぶ', async (label, handler) => {
    const callback = vi.fn()
    renderToolbar({ [handler]: callback })

    await userEvent.click(button(label))

    expect(callback).toHaveBeenCalledOnce()
  })

  it.each([
    ['月', 'week', 'month'],
    ['週', 'month', 'week'],
  ] as const)('「%s」で %s から %s へ切り替える', async (label, view, next) => {
    const onChangeView = vi.fn()
    renderToolbar({ view, onChangeView })

    await userEvent.click(button(label))

    expect(onChangeView).toHaveBeenCalledWith(next)
  })

  it('今の表示のボタンだけ押された状態にする', () => {
    renderToolbar({ view: 'week' })

    expect(button('週')).toHaveAttribute('aria-pressed', 'true')
    expect(button('月')).toHaveAttribute('aria-pressed', 'false')
  })

  describe('週次分析ボタン', () => {
    it('押すと onOpenAnalysis を呼ぶ', async () => {
      const onOpenAnalysis = vi.fn()
      renderToolbar({ onOpenAnalysis })

      await userEvent.click(button('週次分析'))

      expect(onOpenAnalysis).toHaveBeenCalledOnce()
    })

    it('onOpenAnalysis が無ければ出さない', () => {
      renderToolbar()

      expect(screen.queryByRole('button', { name: '週次分析' })).not.toBeInTheDocument()
    })

    it('月・週の切り替えより左に置く', () => {
      renderToolbar({ onOpenAnalysis: vi.fn() })

      const position = button('週次分析').compareDocumentPosition(button('月'))

      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })
})
