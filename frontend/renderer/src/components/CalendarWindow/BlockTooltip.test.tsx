// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { BlockTooltip } from './BlockTooltip'

type Props = ComponentProps<typeof BlockTooltip>

function renderTooltip(props: Partial<Props> = {}) {
  return render(
    <BlockTooltip name="設計レビュー" timeRange="09:00 – 12:00" minutes={180} projectCode="P001" workCategory="開発" {...props}>
      <button>ブロック</button>
    </BlockTooltip>,
  )
}

async function hoverBlock(): Promise<void> {
  await userEvent.hover(screen.getByRole('button', { name: 'ブロック' }))
  await screen.findByText('設計レビュー')
}

describe('BlockTooltip', () => {
  it('カーソルを合わせるまで中身を出さない', () => {
    renderTooltip()

    expect(screen.queryByText('設計レビュー')).not.toBeInTheDocument()
  })

  it('カーソルを合わせると作業名・時刻・分を出す', async () => {
    renderTooltip()

    await hoverBlock()

    expect(screen.getByText('09:00 – 12:00')).toBeInTheDocument()
    expect(screen.getByText('180分')).toBeInTheDocument()
  })

  it('カーソルを合わせると PJコードと作業区分を出す', async () => {
    renderTooltip()

    await hoverBlock()

    expect(screen.getByText('P001')).toBeInTheDocument()
    expect(screen.getByText('開発')).toBeInTheDocument()
  })

  it('時刻を持たない記録では時刻の行を出さない', async () => {
    renderTooltip({ timeRange: undefined })

    await hoverBlock()

    expect(screen.queryByText(/–/)).not.toBeInTheDocument()
  })

  it('PJコードと作業区分が空なら出さない', async () => {
    renderTooltip({ projectCode: '', workCategory: '' })

    await hoverBlock()

    expect(screen.queryByText('P001')).not.toBeInTheDocument()
    expect(screen.queryByText('開発')).not.toBeInTheDocument()
  })
})
