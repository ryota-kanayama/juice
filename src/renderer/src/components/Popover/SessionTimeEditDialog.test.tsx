import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SessionTimeEditDialog } from './SessionTimeEditDialog'
import type { Session } from '../../types/session'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '1',
    taskId: '1',
    name: '企画書作業',
    projectCode: 'P001',
    workCategory: '設計',
    times: [{ startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:45:00' }],
    date: '2026-02-25',
    color: '#FF9500',
    totalTime: 45,
    ...overrides,
  }
}

describe('SessionTimeEditDialog', () => {
  it('セッションの開始/終了時刻と作業名を表示する', () => {
    render(
      <SessionTimeEditDialog open session={makeSession()} onSubmit={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
    const start = screen.getByRole('group', { name: '開始時刻' })
    const end = screen.getByRole('group', { name: '終了時刻' })
    expect(within(start).getByLabelText('時')).toHaveValue('10')
    expect(within(start).getByLabelText('分')).toHaveValue('00')
    expect(within(end).getByLabelText('時')).toHaveValue('10')
    expect(within(end).getByLabelText('分')).toHaveValue('45')
  })

  it('算出された合計時間を表示する（45分）', () => {
    render(
      <SessionTimeEditDialog open session={makeSession()} onSubmit={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText(/45分/)).toBeInTheDocument()
  })

  it('終了 <= 開始 のとき保存ボタンが無効になる', () => {
    render(
      <SessionTimeEditDialog open session={makeSession()} onSubmit={vi.fn()} onClose={vi.fn()} />
    )
    const end = screen.getByRole('group', { name: '終了時刻' })
    // 終了を 09:00（開始 10:00 より前）に変更
    fireEvent.change(within(end).getByLabelText('時'), { target: { value: '09' } })
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('時刻を変更して保存すると onSubmit が新しい開始/終了で呼ばれる', () => {
    const onSubmit = vi.fn()
    render(
      <SessionTimeEditDialog open session={makeSession()} onSubmit={onSubmit} onClose={vi.fn()} />
    )
    const start = screen.getByRole('group', { name: '開始時刻' })
    fireEvent.change(within(start).getByLabelText('時'), { target: { value: '09' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSubmit).toHaveBeenCalledWith('09:00', '10:45')
  })
})
