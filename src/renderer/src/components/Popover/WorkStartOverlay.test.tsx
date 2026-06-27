import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkStartOverlay } from './WorkStartOverlay'

describe('WorkStartOverlay', () => {
  it('日付（2026年6月10日(水)）と業務開始ボタンを表示する', () => {
    render(<WorkStartOverlay date="2026-06-10" onStart={vi.fn()} onTeleworkStart={vi.fn()} />)
    expect(screen.getByText('2026年6月10日(水)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '業務開始' })).toBeInTheDocument()
  })

  it('業務開始で onStart が入力時刻・在宅false で呼ばれる', () => {
    const onStart = vi.fn()
    render(<WorkStartOverlay date="2026-06-10" onStart={onStart} onTeleworkStart={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('時'), { target: { value: '09' } })
    fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: '業務開始' }))
    expect(onStart).toHaveBeenCalledWith('09:30', false)
  })

  it('在宅トグルONで onStart の在宅がtrue、onTeleworkStart も呼ばれる', async () => {
    const onStart = vi.fn()
    const onTeleworkStart = vi.fn()
    const user = userEvent.setup()
    render(<WorkStartOverlay date="2026-06-10" onStart={onStart} onTeleworkStart={onTeleworkStart} />)
    await user.click(screen.getByRole('switch', { name: '在宅' }))
    fireEvent.change(screen.getByLabelText('時'), { target: { value: '09' } })
    fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: '業務開始' }))
    expect(onStart).toHaveBeenCalledWith('09:30', true)
    expect(onTeleworkStart).toHaveBeenCalledTimes(1)
  })

  it('業務開始ボタンに data-tour が付く', () => {
    render(<WorkStartOverlay date="2026-06-27" onStart={vi.fn()} onTeleworkStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: '業務開始' })).toHaveAttribute('data-tour', 'work-start')
  })
})
