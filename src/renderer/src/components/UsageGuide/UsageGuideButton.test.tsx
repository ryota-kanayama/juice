import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsageGuideButton } from './UsageGuideButton'

describe('UsageGuideButton', () => {
  it('「使い方」ボタン押下で onOpen を呼ぶ', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<UsageGuideButton onOpen={onOpen} />)
    await user.click(screen.getByRole('button', { name: '使い方' }))
    expect(onOpen).toHaveBeenCalled()
  })
})
