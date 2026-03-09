import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayDetail } from './DayDetail'
import type { Session } from '../../types/session'

const session: Session = {
  id: '1',
  taskId: '1',
  name: '企画書作業',
  projectCode: 'P001',
  workCategory: '設計',
  times: [{ startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:45:00' }],
  date: '2026-02-25',
  color: '#FF9500',
  totalTime: 45,
}

describe('DayDetail', () => {
  it('日付未選択のときプレースホルダーを表示する', () => {
    render(<DayDetail date={null} sessions={[]} />)
    expect(screen.getByText('日付を選択してください')).toBeInTheDocument()
  })

  it('セッション一覧と合計を表示する', () => {
    render(<DayDetail date="2026-02-25" sessions={[session]} />)
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
    expect(screen.getAllByText(/45分/)).toHaveLength(2) // アイテムの duration + 合計
  })

  it('times配列に複数インターバルがある場合はサブリストで表示する', () => {
    const multiSession: Session = {
      ...session,
      times: [
        { startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:30:00' },
        { startTime: '2026-02-25T11:00:00', endTime: '2026-02-25T11:15:00' },
      ],
    }
    render(<DayDetail date="2026-02-25" sessions={[multiSession]} />)
    expect(screen.getByText(/10:00/)).toBeInTheDocument()
    expect(screen.getByText(/11:15/)).toBeInTheDocument()
  })

  it('✏️ボタンをクリックするとinputが表示される', async () => {
    const user = userEvent.setup()
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('企画書作業')
  })

  it('EnterキーでonUpdateが呼ばれる', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '新しい作業名{Enter}')
    expect(onUpdate).toHaveBeenCalledWith({ ...session, name: '新しい作業名' })
  })

  it('Escapeキーで編集を破棄してonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
    await user.type(screen.getByRole('textbox'), '変更途中{Escape}')
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
  })

  it('空文字のままEnterを押してもonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
    await user.clear(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('異なるセッションは別エントリとして表示する', () => {
    const s1: Session = { id: '1', taskId: '1', name: '会議', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-02-25T09:00:00', endTime: '2026-02-25T09:30:00' }],
      date: '2026-02-25', color: '#FF9500', totalTime: 30 }
    const s2: Session = { id: '2', taskId: '2', name: '会議', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-02-25T14:00:00', endTime: '2026-02-25T14:30:00' }],
      date: '2026-02-25', color: '#F7B731', totalTime: 30 }
    render(<DayDetail date="2026-02-25" sessions={[s1, s2]} />)
    expect(screen.getAllByText('会議')).toHaveLength(2)
  })
})
