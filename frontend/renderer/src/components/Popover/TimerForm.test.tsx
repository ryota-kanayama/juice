import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimerForm } from './TimerForm'

const SUGGESTIONS = [
  { name: '資料作成', projectCode: 'P001', workCategory: '設計' },
  { name: 'レビュー', projectCode: 'P002', workCategory: '会議' },
]

const nameInput = () => screen.getByPlaceholderText('どんなジュースにしますか？')
const pourButton = () => screen.getByRole('button', { name: '注ぐ' })

describe('TimerForm', () => {
  it('入力した作業名で onStart を呼ぶ（PJコード・作業区分は無し）', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} />)
    await userEvent.type(nameInput(), 'テスト作業')

    await userEvent.click(pourButton())

    expect(onStart).toHaveBeenCalledWith('テスト作業', undefined, undefined)
  })

  it('前後の空白を除いた作業名を渡す', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} />)
    await userEvent.type(nameInput(), '  テスト作業  ')

    await userEvent.click(pourButton())

    expect(onStart).toHaveBeenCalledWith('テスト作業', undefined, undefined)
  })

  it('Enter でも開始する', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} />)

    await userEvent.type(nameInput(), 'テスト作業{Enter}')

    expect(onStart).toHaveBeenCalledOnce()
  })

  it('作業名が空なら「注ぐ」を押せない', () => {
    render(<TimerForm onStart={vi.fn()} />)

    expect(pourButton()).toBeDisabled()
  })

  it('作業名が空白だけなら「注ぐ」を押せない', async () => {
    render(<TimerForm onStart={vi.fn()} />)

    await userEvent.type(nameInput(), '   ')

    expect(pourButton()).toBeDisabled()
  })

  it('開始したら入力欄を空にする', async () => {
    render(<TimerForm onStart={vi.fn()} />)
    await userEvent.type(nameInput(), 'テスト')

    await userEvent.click(pourButton())

    expect(nameInput()).toHaveValue('')
  })

  it('候補を選んで開始すると、その候補の PJコード・作業区分も渡す', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} nameSuggestions={SUGGESTIONS} />)
    await userEvent.click(nameInput())
    await userEvent.click(screen.getByText('資料作成'))

    await userEvent.click(pourButton())

    expect(onStart).toHaveBeenCalledWith('資料作成', 'P001', '設計')
  })

  it('候補を選んだあとに名前を書き換えたら、PJコード・作業区分は渡さない', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} nameSuggestions={SUGGESTIONS} />)
    await userEvent.click(nameInput())
    await userEvent.click(screen.getByText('資料作成'))
    await userEvent.type(nameInput(), '2')

    await userEvent.click(pourButton())

    expect(onStart).toHaveBeenCalledWith('資料作成2', undefined, undefined)
  })

  it('候補を選んで開始したあと、次の開始には候補を引き継がない', async () => {
    const onStart = vi.fn()
    render(<TimerForm onStart={onStart} nameSuggestions={SUGGESTIONS} />)
    await userEvent.click(nameInput())
    await userEvent.click(screen.getByText('資料作成'))
    await userEvent.click(pourButton())
    await userEvent.type(nameInput(), '別の作業')

    await userEvent.click(pourButton())

    expect(onStart).toHaveBeenLastCalledWith('別の作業', undefined, undefined)
  })

  it('「注ぐ」ボタンにツアー用のアンカーを付ける', () => {
    render(<TimerForm onStart={vi.fn()} />)

    expect(pourButton()).toHaveAttribute('data-tour', 'demo-pour')
  })
})
