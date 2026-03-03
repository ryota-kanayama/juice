import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionList } from './SessionList'
import type { Session } from '../../types/session'

// Helper: create a session with times[]
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

const sessions: Session[] = [
  makeSession(),
  makeSession({ id: '2', taskId: '2', name: 'メール対応', projectCode: '', workCategory: '',
    times: [{ startTime: '2026-02-25T11:00:00', endTime: '2026-02-25T11:20:00' }], color: '#F7B731', totalTime: 20 }),
]

describe('SessionList — 基本表示', () => {
  it('セッション一覧を表示する', () => {
    render(<SessionList sessions={sessions} />)
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
    expect(screen.getByText('メール対応')).toBeInTheDocument()
  })

  it('合計時間を表示する（65分）', () => {
    render(<SessionList sessions={sessions} />)
    expect(screen.getByText(/65分/)).toBeInTheDocument()
  })

  it('セッションが空のときメッセージを表示', () => {
    render(<SessionList sessions={[]} />)
    expect(screen.getByText(/まだジュースを注いでいません/)).toBeInTheDocument()
  })

  it('時間範囲を表示する', () => {
    render(<SessionList sessions={sessions} />)
    expect(screen.getByText(/10:00/)).toBeInTheDocument()
    expect(screen.getByText(/10:45/)).toBeInTheDocument()
  })

  it('PJコードと作業区分をメタタグで表示する', () => {
    render(<SessionList sessions={sessions} />)
    expect(screen.getByText('P001')).toBeInTheDocument()
    expect(screen.getByText('設計')).toBeInTheDocument()
  })
})

describe('SessionList — times[]複数インターバル表示', () => {
  it('times配列に複数インターバルがあるとサブリストで表示する', () => {
    const session = makeSession({
      times: [
        { startTime: '2026-02-25T08:07:00', endTime: '2026-02-25T08:46:00' },
        { startTime: '2026-02-25T08:49:00', endTime: '2026-02-25T09:26:00' },
      ],
    })
    render(<SessionList sessions={[session]} />)
    expect(screen.getByText(/08:07/)).toBeInTheDocument()
    expect(screen.getByText(/09:26/)).toBeInTheDocument()
  })

  it('times配列の合計時間を表示する（76分）', () => {
    const session = makeSession({
      times: [
        { startTime: '2026-02-25T08:07:00', endTime: '2026-02-25T08:46:00' },
        { startTime: '2026-02-25T08:49:00', endTime: '2026-02-25T09:26:00' },
      ],
      totalTime: 76,
    })
    render(<SessionList sessions={[session]} />)
    expect(screen.getAllByText(/76分/).length).toBeGreaterThanOrEqual(1)
  })

  it('endTimeがnullのインターバルは「HH:MM〜」と表示する', () => {
    const session = makeSession({
      times: [
        { startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:45:00' },
        { startTime: '2026-02-25T11:00:00', endTime: null },
      ],
    })
    render(<SessionList sessions={[session]} />)
    expect(screen.getByText(/11:00〜$/)).toBeInTheDocument()
  })
})

describe('SessionList — 編集', () => {
  it('✏️ボタンをクリックするとinputが表示される', async () => {
    const user = userEvent.setup()
    render(<SessionList sessions={[makeSession()]} onUpdate={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '名前を編集' }))
    expect(screen.getByRole('textbox', { name: 'セッション名' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'セッション名' })).toHaveValue('企画書作業')
  })

  it('EnterキーでonUpdateが更新されたセッションで呼ばれる', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '名前を編集' }))
    await user.clear(screen.getByRole('textbox', { name: 'セッション名' }))
    await user.type(screen.getByRole('textbox', { name: 'セッション名' }), '新しい名前{Enter}')
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい名前' }))
  })

  it('Escapeキーで編集を破棄してonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '名前を編集' }))
    await user.type(screen.getByRole('textbox', { name: 'セッション名' }), '変更途中{Escape}')
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
  })

  it('空文字のままEnterを押してもonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '名前を編集' }))
    await user.clear(screen.getByRole('textbox', { name: 'セッション名' }))
    await user.keyboard('{Enter}')
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('コンテキストメニュー', () => {
  it('セッションを右クリックするとコンテキストメニューが表示される', async () => {
    render(<SessionList sessions={[makeSession()]} onDelete={vi.fn()} />)
    const listitem = screen.getByRole('listitem')
    fireEvent.contextMenu(listitem)
    expect(screen.getByText('流す')).toBeInTheDocument()
  })

  it('流すボタンをクリックして確認すると onDelete がセッションIDで呼ばれる', async () => {
    const onDelete = vi.fn()
    render(<SessionList sessions={[makeSession()]} onDelete={onDelete} />)
    const listitem = screen.getByRole('listitem')
    fireEvent.contextMenu(listitem)
    fireEvent.click(screen.getByText('流す'))
    expect(screen.getByText('本当に流しますか？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '流す' }))
    expect(onDelete).toHaveBeenCalledWith('1')
  })

  it('メニュー外をクリックするとメニューが消える', async () => {
    render(<SessionList sessions={[makeSession()]} onDelete={vi.fn()} />)
    const listitem = screen.getByRole('listitem')
    fireEvent.contextMenu(listitem)
    expect(screen.getByText('流す')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    await waitFor(() => {
      expect(screen.queryByText('流す')).not.toBeInTheDocument()
    })
  })

  it('Escape キーを押すとメニューが消える', async () => {
    render(<SessionList sessions={[makeSession()]} onDelete={vi.fn()} />)
    const listitem = screen.getByRole('listitem')
    fireEvent.contextMenu(listitem)
    expect(screen.getByText('流す')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText('流す')).not.toBeInTheDocument()
    })
  })
})

describe('SessionList — 追加ボタン', () => {
  it('isRunning=true のとき「追加で注ぐ」ボタンが表示されない', () => {
    render(<SessionList sessions={sessions} isRunning={true} onStartMore={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '追加で注ぐ' })).not.toBeInTheDocument()
  })

  it('「追加で注ぐ」ボタンをクリックすると onStartMore がセッションで呼ばれる', async () => {
    const user = userEvent.setup()
    const onStartMore = vi.fn()
    render(<SessionList sessions={sessions} isRunning={false} onStartMore={onStartMore} />)
    await user.click(screen.getAllByRole('button', { name: '追加で注ぐ' })[0])
    expect(onStartMore).toHaveBeenCalledTimes(1)
    expect(onStartMore).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })
})
