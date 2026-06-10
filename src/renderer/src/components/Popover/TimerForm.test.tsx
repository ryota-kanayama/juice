import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimerForm } from './TimerForm'

const SUGGESTIONS = [
  { name: '資料作成', projectCode: 'P001', workCategory: '設計' },
  { name: 'レビュー', projectCode: 'P002', workCategory: '会議' },
]

describe('TimerForm', () => {
  it('タイマー名を入力してスタートボタンを押すとonStartが呼ばれる', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} />)
    const input = screen.getByPlaceholderText('どんなジュースにしますか？')
    await userEvent.type(input, 'テスト作業')
    await userEvent.click(screen.getByRole('button', { name: '注ぐ' }))
    expect(onStart).toHaveBeenCalledWith('テスト作業', undefined, undefined)
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

  it('候補を選択して開始すると PJコード・作業区分も渡される', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} nameSuggestions={SUGGESTIONS} />)
    await userEvent.click(screen.getByPlaceholderText('どんなジュースにしますか？'))
    await userEvent.click(screen.getByText('資料作成'))
    await userEvent.click(screen.getByRole('button', { name: '注ぐ' }))
    expect(onStart).toHaveBeenCalledWith('資料作成', 'P001', '設計')
  })

  it('候補選択後に名前を手入力で変えると PJコード・作業区分は渡されない', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} nameSuggestions={SUGGESTIONS} />)
    const input = screen.getByPlaceholderText('どんなジュースにしますか？')
    await userEvent.click(input)
    await userEvent.click(screen.getByText('資料作成'))
    await userEvent.type(input, '2')
    await userEvent.click(screen.getByRole('button', { name: '注ぐ' }))
    expect(onStart).toHaveBeenCalledWith('資料作成2', undefined, undefined)
  })
})
