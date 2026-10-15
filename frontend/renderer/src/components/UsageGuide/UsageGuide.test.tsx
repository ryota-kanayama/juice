import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsageGuide } from './UsageGuide'

const TITLES = ['作業を始める', '記録を見る', '記録を編集', '追加・削除', '並び替え', '休憩・終了', 'カレンダー', '勤怠を調整', '共有']

const nextButton = () => screen.getByRole('button', { name: '次の項目へ' })
const prevButton = () => screen.getByRole('button', { name: '前の項目へ' })

async function next(times: number): Promise<void> {
  for (let i = 0; i < times; i++) await userEvent.click(nextButton())
}

describe('UsageGuide', () => {
  it('最初は先頭の項目だけを出す', () => {
    render(<UsageGuide />)

    expect(screen.getByText('作業を始める')).toBeInTheDocument()
    expect(screen.queryByText('記録を見る')).not.toBeInTheDocument()
  })

  it('「次の項目へ」で次の項目に進む', async () => {
    render(<UsageGuide />)

    await next(1)

    expect(screen.getByText('記録を見る')).toBeInTheDocument()
    expect(screen.queryByText('作業を始める')).not.toBeInTheDocument()
  })

  it('「前の項目へ」で前の項目に戻る', async () => {
    render(<UsageGuide />)
    await next(1)

    await userEvent.click(prevButton())

    expect(screen.getByText('作業を始める')).toBeInTheDocument()
  })

  it('先頭では「前の項目へ」を押せない', () => {
    render(<UsageGuide />)

    expect(prevButton()).toBeDisabled()
  })

  it.each(TITLES.map((title, i) => [i, title] as const))('%i 回進むと「%s」を出す', async (steps, title) => {
    render(<UsageGuide />)

    await next(steps)

    expect(screen.getByText(title)).toBeInTheDocument()
  })

  it('最後の項目では「次の項目へ」を押せない', async () => {
    render(<UsageGuide />)

    await next(TITLES.length - 1)

    expect(nextButton()).toBeDisabled()
  })

  it('最後の1つ手前ではまだ「次の項目へ」を押せる', async () => {
    render(<UsageGuide />)

    await next(TITLES.length - 2)

    expect(nextButton()).toBeEnabled()
  })
})
