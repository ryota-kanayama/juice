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

  it('PJコードと作業区分をメタタグで表示する', () => {
    render(<SessionList sessions={sessions} />)
    expect(screen.getByText('P001')).toBeInTheDocument()
    expect(screen.getByText('設計')).toBeInTheDocument()
  })
})

describe('SessionList — 合計時間表示', () => {
  it('セッションの合計時間を表示する（76分）', () => {
    const session = makeSession({ totalTime: 76 })
    render(<SessionList sessions={[session]} />)
    expect(screen.getAllByText(/76分/).length).toBeGreaterThanOrEqual(1)
  })
})

describe('SessionList — 編集', () => {
  it('✏️ボタンをクリックするとinputが表示される', async () => {
    const user = userEvent.setup()
    render(<SessionList sessions={[makeSession()]} onUpdate={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
    expect(screen.getByRole('textbox', { name: 'セッション名' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'セッション名' })).toHaveValue('企画書作業')
  })

  it('EnterキーでonUpdateが更新されたセッションで呼ばれる', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
    await user.clear(screen.getByRole('textbox', { name: 'セッション名' }))
    await user.type(screen.getByRole('textbox', { name: 'セッション名' }), '新しい名前{Enter}')
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい名前' }))
  })

  it('Escapeキーで編集を破棄してonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
    await user.type(screen.getByRole('textbox', { name: 'セッション名' }), '変更途中{Escape}')
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
  })

  it('空文字のままEnterを押してもonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.click(screen.getByRole('button', { name: '編集' }))
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

describe('SessionList — 追加フォームの下書き保持', () => {
  async function openAddDialog(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
    fireEvent.contextMenu(container.firstChild as Element)
    await user.click(screen.getByRole('button', { name: '追加' }))
  }

  it('途中まで入力して閉じ、再度開くと下書きが保持される', async () => {
    const user = userEvent.setup()
    const { container } = render(<SessionList sessions={[]} onAdd={vi.fn()} />)

    await openAddDialog(container, user)
    await user.type(screen.getByPlaceholderText('作業名（必須）'), '仕様検討')
    await user.type(screen.getByPlaceholderText('PJコード'), 'P999')
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    await openAddDialog(container, user)
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('仕様検討')
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P999')
  })

  it('追加に成功すると下書きはクリアされる', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = render(<SessionList sessions={[]} onAdd={onAdd} />)

    await openAddDialog(container, user)
    await user.type(screen.getByPlaceholderText('作業名（必須）'), '実装')
    await user.type(screen.getByPlaceholderText('分'), '30')
    await user.click(screen.getByRole('button', { name: '追加' }))
    expect(onAdd).toHaveBeenCalledTimes(1)

    await openAddDialog(container, user)
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('')
  })
})

const TEST_SUGGESTIONS = {
  names: [
    { name: '資料作成', projectCode: 'P001', workCategory: '設計' },
  ],
  projectCodes: ['P001', 'P002'],
  workCategories: ['設計', '会議'],
}

describe('SessionList — 入力候補', () => {
  it('追加ダイアログで作業名候補を選択すると PJコード・作業区分も埋まる', async () => {
    render(<SessionList sessions={[]} onAdd={vi.fn()} suggestions={TEST_SUGGESTIONS} />)
    fireEvent.contextMenu(screen.getByText('まだジュースを注いでいません'))
    await userEvent.click(screen.getByText('追加'))
    await userEvent.click(screen.getByPlaceholderText('作業名（必須）'))
    await userEvent.click(screen.getByText('資料作成'))
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('資料作成')
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P001')
    expect(screen.getByPlaceholderText('作業区分')).toHaveValue('設計')
  })

  it('追加ダイアログで PJコード候補を選択できる', async () => {
    render(<SessionList sessions={[]} onAdd={vi.fn()} suggestions={TEST_SUGGESTIONS} />)
    fireEvent.contextMenu(screen.getByText('まだジュースを注いでいません'))
    await userEvent.click(screen.getByText('追加'))
    await userEvent.click(screen.getByPlaceholderText('PJコード'))
    await userEvent.click(screen.getByText('P002'))
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P002')
  })
})

describe('SessionList — 追加ダイアログの Escape 2段階動作', () => {
  it('追加ダイアログでドロップダウン表示中の Escape はダイアログを閉じず、2回目で閉じる', async () => {
    render(<SessionList sessions={[]} onAdd={vi.fn()} suggestions={TEST_SUGGESTIONS} />)
    fireEvent.contextMenu(screen.getByText('まだジュースを注いでいません'))
    await userEvent.click(screen.getByText('追加'))
    // 作業名にフォーカスしてドロップダウンを開く
    await userEvent.click(screen.getByPlaceholderText('作業名（必須）'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    // 1回目: ドロップダウンだけ閉じる
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('作業名（必須）')).toBeInTheDocument()
    // 2回目: ダイアログが閉じる
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByPlaceholderText('作業名（必須）')).not.toBeInTheDocument()
  })
})

describe('SessionList — 業務終了', () => {
  it('終了→時刻を変更→確定で onWorkEnd が "HH:mm" で呼ばれる', () => {
    const onWorkEnd = vi.fn()
    render(<SessionList sessions={[makeSession()]} workStart="09:00" onWorkEnd={onWorkEnd} />)
    fireEvent.click(screen.getByRole('button', { name: '終了' }))
    fireEvent.change(screen.getByLabelText('時'), { target: { value: '18' } })
    fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(onWorkEnd).toHaveBeenCalledWith('18:30')
  })

  it('時刻セグメントでの Enter がラッパー経由で確定し onWorkEnd を呼ぶ', () => {
    const onWorkEnd = vi.fn()
    render(<SessionList sessions={[makeSession()]} workStart="09:00" onWorkEnd={onWorkEnd} />)
    fireEvent.click(screen.getByRole('button', { name: '終了' }))
    fireEvent.change(screen.getByLabelText('時'), { target: { value: '18' } })
    fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })
    fireEvent.keyDown(screen.getByLabelText('分'), { key: 'Enter' })
    expect(onWorkEnd).toHaveBeenCalledWith('18:30')
  })
})
