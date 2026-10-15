import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsageGuidePanel } from './UsageGuidePanel'

describe('UsageGuidePanel', () => {
  it('「使い方」の見出しと最初の項目を出す', () => {
    render(<UsageGuidePanel onClose={vi.fn()} />)

    expect(screen.getByText('使い方')).toBeInTheDocument()
    expect(screen.getByText('作業を始める')).toBeInTheDocument()
  })

  it('「戻る」で onClose を呼ぶ', async () => {
    const onClose = vi.fn()
    render(<UsageGuidePanel onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: '戻る' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('「ツアーを見る」で、パネルを閉じてからツアーを始める', async () => {
    const calls: string[] = []
    render(<UsageGuidePanel onClose={() => calls.push('close')} onStartTour={() => calls.push('tour')} />)

    await userEvent.click(screen.getByRole('button', { name: 'ツアーを見る' }))

    expect(calls).toEqual(['close', 'tour'])
  })

  it('onStartTour が無ければ「ツアーを見る」を出さない', () => {
    render(<UsageGuidePanel onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'ツアーを見る' })).not.toBeInTheDocument()
  })
})
