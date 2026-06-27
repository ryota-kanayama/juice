import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsageGuideButton } from './UsageGuideButton'

describe('UsageGuideButton', () => {
  it('初期状態ではガイドダイアログは閉じている', () => {
    render(<UsageGuideButton />)
    expect(screen.queryByText('使い方')).not.toBeInTheDocument()
  })

  it('「使い方」ボタンでガイドが開く', async () => {
    const user = userEvent.setup()
    render(<UsageGuideButton />)
    await user.click(screen.getByRole('button', { name: '使い方' }))
    expect(await screen.findByText('使い方')).toBeInTheDocument()
    expect(screen.getByText('記録を編集')).toBeInTheDocument()
  })
})
