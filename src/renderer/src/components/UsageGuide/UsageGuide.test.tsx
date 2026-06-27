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
    expect(screen.getByText('記録を編集')).toBeInTheDocument()
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
})
