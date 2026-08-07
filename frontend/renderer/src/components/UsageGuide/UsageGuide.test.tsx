import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsageGuide } from './UsageGuide'

describe('UsageGuide', () => {
  it('最初は先頭の項目だけを表示する', () => {
    render(<UsageGuide />)
    expect(screen.getByText('作業を始める')).toBeInTheDocument()
    expect(screen.queryByText('記録を編集')).not.toBeInTheDocument()
  })

  it('「次の項目へ」で次の項目に進む', async () => {
    const user = userEvent.setup()
    render(<UsageGuide />)
    await user.click(screen.getByRole('button', { name: '次の項目へ' }))
    expect(screen.getByText('記録を見る')).toBeInTheDocument()
    expect(screen.queryByText('作業を始める')).not.toBeInTheDocument()
  })

  it('「前の項目へ」で前の項目に戻る', async () => {
    const user = userEvent.setup()
    render(<UsageGuide />)
    await user.click(screen.getByRole('button', { name: '次の項目へ' }))
    await user.click(screen.getByRole('button', { name: '前の項目へ' }))
    expect(screen.getByText('作業を始める')).toBeInTheDocument()
  })

  it('先頭では「前の項目へ」が無効', () => {
    render(<UsageGuide />)
    expect(screen.getByRole('button', { name: '前の項目へ' })).toBeDisabled()
  })

  it('9 項目ある（8 回進むと最後に着く）', async () => {
    const user = userEvent.setup()
    render(<UsageGuide />)
    // 8 回進んだ時点ではまだ押せる状態にならず、9 項目目で無効になる
    for (let i = 0; i < 7; i += 1) {
      await user.click(screen.getByRole('button', { name: '次の項目へ' }))
    }
    expect(screen.getByRole('button', { name: '次の項目へ' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '次の項目へ' }))
    expect(screen.getByRole('button', { name: '次の項目へ' })).toBeDisabled()
    expect(screen.getByText('共有')).toBeInTheDocument()
  })

  it('カレンダーの項目を含む', async () => {
    const user = userEvent.setup()
    render(<UsageGuide />)
    for (let i = 0; i < 6; i += 1) {
      await user.click(screen.getByRole('button', { name: '次の項目へ' }))
    }
    expect(screen.getByText('カレンダー')).toBeInTheDocument()
  })
})
