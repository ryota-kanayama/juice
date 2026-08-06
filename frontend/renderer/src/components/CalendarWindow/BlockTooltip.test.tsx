// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockTooltip } from './BlockTooltip'

function setup(props: Partial<React.ComponentProps<typeof BlockTooltip>> = {}) {
  return render(
    <BlockTooltip
      name="設計レビュー"
      timeRange="09:00 – 12:00"
      minutes={180}
      projectCode="P001"
      workCategory="開発"
      {...props}
    >
      <button>ブロック</button>
    </BlockTooltip>
  )
}

describe('BlockTooltip', () => {
  it('ホバーするまで中身を出さない', () => {
    setup()
    expect(screen.queryByText('設計レビュー')).not.toBeInTheDocument()
  })

  it('ホバーすると作業名・時刻・分を出す', async () => {
    const user = userEvent.setup()
    setup()
    await user.hover(screen.getByRole('button', { name: 'ブロック' }))
    expect(await screen.findByText('設計レビュー')).toBeInTheDocument()
    expect(screen.getByText('09:00 – 12:00')).toBeInTheDocument()
    expect(screen.getByText('180分')).toBeInTheDocument()
  })

  it('ホバーすると PJコードと作業区分を出す', async () => {
    const user = userEvent.setup()
    setup()
    await user.hover(screen.getByRole('button', { name: 'ブロック' }))
    expect(await screen.findByText('P001')).toBeInTheDocument()
    expect(screen.getByText('開発')).toBeInTheDocument()
  })

  it('時刻を持たない記録では時刻の行を出さない', async () => {
    const user = userEvent.setup()
    setup({ timeRange: undefined })
    await user.hover(screen.getByRole('button', { name: 'ブロック' }))
    expect(await screen.findByText('設計レビュー')).toBeInTheDocument()
    expect(screen.queryByText(/–/)).not.toBeInTheDocument()
  })

  it('PJコードと作業区分が空なら出さない', async () => {
    const user = userEvent.setup()
    setup({ projectCode: '', workCategory: '' })
    await user.hover(screen.getByRole('button', { name: 'ブロック' }))
    expect(await screen.findByText('設計レビュー')).toBeInTheDocument()
    expect(screen.queryByText('P001')).not.toBeInTheDocument()
    expect(screen.queryByText('開発')).not.toBeInTheDocument()
  })
})
