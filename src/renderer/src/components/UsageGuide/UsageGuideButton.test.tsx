import { describe, it, expect, vi } from 'vitest'
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
    expect(screen.getByText('作業を始める')).toBeInTheDocument()
  })

  it('onStartTour 指定時、「ツアーを見る」で閉じてコールバックを呼ぶ', async () => {
    const onStartTour = vi.fn()
    const user = userEvent.setup()
    render(<UsageGuideButton onStartTour={onStartTour} />)
    await user.click(screen.getByRole('button', { name: '使い方' }))
    await user.click(await screen.findByRole('button', { name: 'ツアーを見る' }))
    expect(onStartTour).toHaveBeenCalled()
  })
})
