import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsageGuideButton } from './UsageGuideButton'

describe('UsageGuideButton', () => {
  it('「使い方」を押すと onOpen を呼ぶ', async () => {
    const onOpen = vi.fn()
    render(<UsageGuideButton onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('button', { name: '使い方' }))

    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('ツアー用のアンカーを付ける', () => {
    const { container } = render(<UsageGuideButton onOpen={vi.fn()} />)

    expect(container.querySelector('[data-tour="help"]')).not.toBeNull()
  })
})
