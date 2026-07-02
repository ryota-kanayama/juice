import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsageGuidePanel } from './UsageGuidePanel'

describe('UsageGuidePanel', () => {
  it('使い方の見出しと最初の項目を表示する', () => {
    render(<UsageGuidePanel onClose={() => {}} />)
    expect(screen.getByText('使い方')).toBeInTheDocument()
    expect(screen.getByText('作業を始める')).toBeInTheDocument()
  })

  it('「戻る」で onClose を呼ぶ', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<UsageGuidePanel onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('onStartTour 指定時、「ツアーを見る」で onClose→onStartTour を呼ぶ', async () => {
    const onClose = vi.fn()
    const onStartTour = vi.fn()
    const user = userEvent.setup()
    render(<UsageGuidePanel onClose={onClose} onStartTour={onStartTour} />)
    await user.click(screen.getByRole('button', { name: 'ツアーを見る' }))
    expect(onClose).toHaveBeenCalled()
    expect(onStartTour).toHaveBeenCalled()
  })

  it('onStartTour 未指定なら「ツアーを見る」は表示しない', () => {
    render(<UsageGuidePanel onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'ツアーを見る' })).not.toBeInTheDocument()
  })
})
