import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimerForm } from './TimerForm'

describe('TimerForm', () => {
  it('タイマー名を入力してスタートボタンを押すとonStartが呼ばれる', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} />)
    const input = screen.getByPlaceholderText('どんなジュースにしますか？')
    await userEvent.type(input, 'テスト作業')
    await userEvent.click(screen.getByRole('button', { name: '注ぐ' }))
    expect(onStart).toHaveBeenCalledWith('テスト作業')
  })

  it('空の入力ではスタートボタンが無効', () => {
    render(<TimerForm onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: '注ぐ' })).toBeDisabled()
  })

  it('スタート後に入力フィールドがリセットされる', async () => {
    render(<TimerForm onStart={vi.fn()} />)
    const input = screen.getByPlaceholderText('どんなジュースにしますか？')
    await userEvent.type(input, 'テスト')
    await userEvent.click(screen.getByRole('button', { name: '注ぐ' }))
    expect(input).toHaveValue('')
  })
})
