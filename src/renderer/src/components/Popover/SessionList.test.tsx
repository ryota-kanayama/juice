import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionList } from './SessionList'
import { DailyDataProvider } from '../../daily/DailyDataContext'
import type { Session } from '../../types/session'
import type { DailyMonth } from '../../../../shared/types'

// DailyDataProvider が使う electronAPI をモックする
const setDailyDay = vi.fn().mockResolvedValue(undefined)
let mockDayStore: Record<string, { sessionOrder?: string[] }> = {}

vi.stubGlobal('electronAPI', {
  getDailyMonth: vi.fn().mockImplementation((_yearMonth: string): Promise<DailyMonth> =>
    Promise.resolve({ version: 1, days: mockDayStore as DailyMonth['days'] })
  ),
  setDailyDay,
})

// テスト用ラッパー: DailyDataProvider を挿入する
function renderWithProvider(ui: React.ReactElement) {
  return render(<DailyDataProvider>{ui}</DailyDataProvider>)
}

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
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('セッション一覧を表示する', () => {
    renderWithProvider(<SessionList sessions={sessions} />)
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
    expect(screen.getByText('メール対応')).toBeInTheDocument()
  })

  it('合計時間を表示する（65分）', () => {
    renderWithProvider(<SessionList sessions={sessions} />)
    expect(screen.getByText(/65分/)).toBeInTheDocument()
  })

  it('セッションが空のときメッセージを表示', () => {
    renderWithProvider(<SessionList sessions={[]} />)
    expect(screen.getByText(/まだジュースを注いでいません/)).toBeInTheDocument()
  })

  it('PJコードと作業区分をメタタグで表示する', () => {
    renderWithProvider(<SessionList sessions={sessions} />)
    expect(screen.getByText('P001')).toBeInTheDocument()
    expect(screen.getByText('設計')).toBeInTheDocument()
  })
})

describe('SessionList — 合計時間表示', () => {
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('セッションの合計時間を表示する（76分）', () => {
    const session = makeSession({ totalTime: 76 })
    renderWithProvider(<SessionList sessions={[session]} />)
    expect(screen.getAllByText(/76分/).length).toBeGreaterThanOrEqual(1)
  })
})

describe('SessionList — customOrder 同期', () => {
  afterEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('削除済み（存在しない）IDを除去する', async () => {
    // Context から sessionOrder を返す日次ストアを設定する
    mockDayStore = { '2026-02-25': { sessionOrder: ['2', '1', 'STALE-DELETED'] } }
    renderWithProvider(<SessionList sessions={sessions} today="2026-02-25" />)
    await waitFor(() => {
      expect(setDailyDay).toHaveBeenCalledWith(
        '2026-02-25',
        expect.objectContaining({ sessionOrder: ['2', '1'] })
      )
    })
  })

  it('customOrder に無い新規セッションを末尾に取り込む', async () => {
    mockDayStore = { '2026-02-25': { sessionOrder: ['2', '1'] } }
    const withNew = [
      ...sessions,
      makeSession({ id: '3', taskId: '3', name: '新規作業',
        times: [{ startTime: '2026-02-25T12:00:00', endTime: '2026-02-25T12:10:00' }], totalTime: 10 }),
    ]
    renderWithProvider(<SessionList sessions={withNew} today="2026-02-25" />)
    await waitFor(() => {
      expect(setDailyDay).toHaveBeenCalledWith(
        '2026-02-25',
        expect.objectContaining({ sessionOrder: ['2', '1', '3'] })
      )
    })
  })
})

describe('SessionList — 編集', () => {
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('行をダブルクリックすると編集ダイアログがセッションの値で開く', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={vi.fn()} />)
    await user.dblClick(screen.getByText('企画書作業'))
    expect(screen.getByText('タイマーを編集')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('企画書作業')
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P001')
    expect(screen.getByPlaceholderText('作業区分')).toHaveValue('設計')
    expect(screen.getByPlaceholderText('分')).toHaveValue(45)
  })

  it('編集ボタンは表示されない（ダブルクリックと右クリックメニューに移行）', () => {
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
  })

  it('右クリックメニューの「編集」で編集ダイアログが開く', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={vi.fn()} />)
    fireEvent.contextMenu(screen.getByRole('listitem'))
    await user.click(screen.getByText('編集'))
    expect(screen.getByText('タイマーを編集')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('企画書作業')
  })

  it('保存ボタンでonUpdateが更新されたセッションで呼ばれる', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.clear(screen.getByPlaceholderText('作業名（必須）'))
    await user.type(screen.getByPlaceholderText('作業名（必須）'), '新しい名前')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい名前' }))
  })

  it('EnterキーでもonUpdateが呼ばれる', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.clear(screen.getByPlaceholderText('作業名（必須）'))
    await user.type(screen.getByPlaceholderText('作業名（必須）'), '新しい名前{Enter}')
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい名前' }))
  })

  it('時間を変更して保存するとtotalTimeが反映される', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.clear(screen.getByPlaceholderText('分'))
    await user.type(screen.getByPlaceholderText('分'), '90')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ totalTime: 90 }))
  })

  it('Escapeキーでダイアログが閉じonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.type(screen.getByPlaceholderText('作業名（必須）'), '変更途中')
    await user.keyboard('{Escape}')
    expect(screen.queryByText('タイマーを編集')).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
  })

  it('空文字のままEnterを押してもonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.clear(screen.getByPlaceholderText('作業名（必須）'))
    await user.keyboard('{Enter}')
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('SessionList — 時刻を編集', () => {
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('完了セッションの右クリックメニューに「時刻を編集」が表示される', () => {
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={vi.fn()} />)
    fireEvent.contextMenu(screen.getByRole('listitem'))
    expect(screen.getByText('時刻を編集')).toBeInTheDocument()
  })

  it('手動追加セッション（区間なし）では「時刻を編集」が表示されない', () => {
    renderWithProvider(<SessionList sessions={[makeSession({ times: [] })]} onUpdate={vi.fn()} />)
    fireEvent.contextMenu(screen.getByRole('listitem'))
    expect(screen.queryByText('時刻を編集')).not.toBeInTheDocument()
  })

  it('稼働中（最後の区間が未終了）のセッションでは「時刻を編集」が表示されない', () => {
    const running = makeSession({ times: [{ startTime: '2026-02-25T10:00:00', endTime: null }] })
    renderWithProvider(<SessionList sessions={[running]} onUpdate={vi.fn()} />)
    fireEvent.contextMenu(screen.getByRole('listitem'))
    expect(screen.queryByText('時刻を編集')).not.toBeInTheDocument()
  })

  it('「時刻を編集」で専用ダイアログが開き開始/終了が表示される', async () => {
    const user = userEvent.setup()
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={vi.fn()} />)
    fireEvent.contextMenu(screen.getByRole('listitem'))
    await user.click(screen.getByText('時刻を編集'))
    expect(screen.getByText('時刻を編集', { selector: 'h2, [role="heading"]' })).toBeInTheDocument()
    const start = screen.getByRole('group', { name: '開始時刻' })
    expect(within(start).getByLabelText('時')).toHaveValue('10')
  })

  it('時刻を変更して保存すると onUpdate が再計算された times/totalTime で呼ばれる', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    renderWithProvider(<SessionList sessions={[makeSession()]} onUpdate={onUpdate} />)
    fireEvent.contextMenu(screen.getByRole('listitem'))
    await user.click(screen.getByText('時刻を編集'))
    const start = screen.getByRole('group', { name: '開始時刻' })
    fireEvent.change(within(start).getByLabelText('時'), { target: { value: '09' } })
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      totalTime: 105,
      times: [{ startTime: '2026-02-25T09:00:00', endTime: '2026-02-25T10:45:00' }],
    }))
  })
})

describe('コンテキストメニュー', () => {
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('セッションを右クリックするとコンテキストメニューが表示される', async () => {
    renderWithProvider(<SessionList sessions={[makeSession()]} onDelete={vi.fn()} />)
    const listitem = screen.getByRole('listitem')
    fireEvent.contextMenu(listitem)
    expect(screen.getByText('流す')).toBeInTheDocument()
  })

  it('流すボタンをクリックして確認すると onDelete がセッションIDで呼ばれる', async () => {
    const onDelete = vi.fn()
    renderWithProvider(<SessionList sessions={[makeSession()]} onDelete={onDelete} />)
    const listitem = screen.getByRole('listitem')
    fireEvent.contextMenu(listitem)
    fireEvent.click(screen.getByText('流す'))
    expect(screen.getByText('本当に流しますか？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '流す' }))
    expect(onDelete).toHaveBeenCalledWith('1')
  })

  it('メニュー外をクリックするとメニューが消える', async () => {
    renderWithProvider(<SessionList sessions={[makeSession()]} onDelete={vi.fn()} />)
    const listitem = screen.getByRole('listitem')
    fireEvent.contextMenu(listitem)
    expect(screen.getByText('流す')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    await waitFor(() => {
      expect(screen.queryByText('流す')).not.toBeInTheDocument()
    })
  })

  it('Escape キーを押すとメニューが消える', async () => {
    renderWithProvider(<SessionList sessions={[makeSession()]} onDelete={vi.fn()} />)
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
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('isRunning=true のとき「追加で注ぐ」ボタンが表示されない', () => {
    renderWithProvider(<SessionList sessions={sessions} isRunning={true} onStartMore={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '追加で注ぐ' })).not.toBeInTheDocument()
  })

  it('「追加で注ぐ」ボタンをクリックすると onStartMore がセッションで呼ばれる', async () => {
    const user = userEvent.setup()
    const onStartMore = vi.fn()
    renderWithProvider(<SessionList sessions={sessions} isRunning={false} onStartMore={onStartMore} />)
    await user.click(screen.getAllByRole('button', { name: '追加で注ぐ' })[0])
    expect(onStartMore).toHaveBeenCalledTimes(1)
    expect(onStartMore).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })
})

describe('SessionList — 追加フォームの初期化', () => {
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  async function openAddDialog(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
    fireEvent.contextMenu(container.firstChild as Element)
    await user.click(screen.getByRole('button', { name: '追加' }))
  }

  it('途中まで入力して閉じても、再度開くと空になる（下書きは保持しない）', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProvider(<SessionList sessions={[]} onAdd={vi.fn()} />)

    await openAddDialog(container, user)
    await user.type(screen.getByPlaceholderText('作業名（必須）'), '仕様検討')
    await user.type(screen.getByPlaceholderText('PJコード'), 'P999')
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    await openAddDialog(container, user)
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('')
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('')
  })

  it('追加に成功した後も空で開く', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = renderWithProvider(<SessionList sessions={[]} onAdd={onAdd} />)

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
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('追加ダイアログで作業名候補を選択すると PJコード・作業区分も埋まる', async () => {
    renderWithProvider(<SessionList sessions={[]} onAdd={vi.fn()} suggestions={TEST_SUGGESTIONS} />)
    fireEvent.contextMenu(screen.getByText('まだジュースを注いでいません'))
    await userEvent.click(screen.getByText('追加'))
    await userEvent.click(screen.getByPlaceholderText('作業名（必須）'))
    await userEvent.click(screen.getByText('資料作成'))
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('資料作成')
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P001')
    expect(screen.getByPlaceholderText('作業区分')).toHaveValue('設計')
  })

  it('追加ダイアログで PJコード候補を選択できる', async () => {
    renderWithProvider(<SessionList sessions={[]} onAdd={vi.fn()} suggestions={TEST_SUGGESTIONS} />)
    fireEvent.contextMenu(screen.getByText('まだジュースを注いでいません'))
    await userEvent.click(screen.getByText('追加'))
    await userEvent.click(screen.getByPlaceholderText('PJコード'))
    await userEvent.click(screen.getByText('P002'))
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P002')
  })
})

describe('SessionList — 追加ダイアログの Escape 2段階動作', () => {
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('追加ダイアログでドロップダウン表示中の Escape はダイアログを閉じず、2回目で閉じる', async () => {
    renderWithProvider(<SessionList sessions={[]} onAdd={vi.fn()} suggestions={TEST_SUGGESTIONS} />)
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
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('終了→時刻を変更→確定で onWorkEnd が "HH:mm" で呼ばれる', () => {
    const onWorkEnd = vi.fn()
    renderWithProvider(<SessionList sessions={[makeSession()]} workStart="09:00" breakStart="12:00" breakEnd="13:00" onWorkEnd={onWorkEnd} />)
    fireEvent.click(screen.getByRole('button', { name: '終了' }))
    fireEvent.change(screen.getByLabelText('時'), { target: { value: '18' } })
    fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(onWorkEnd).toHaveBeenCalledWith('18:30')
  })

  it('時刻セグメントでの Enter がラッパー経由で確定し onWorkEnd を呼ぶ', () => {
    const onWorkEnd = vi.fn()
    renderWithProvider(<SessionList sessions={[makeSession()]} workStart="09:00" breakStart="12:00" breakEnd="13:00" onWorkEnd={onWorkEnd} />)
    fireEvent.click(screen.getByRole('button', { name: '終了' }))
    fireEvent.change(screen.getByLabelText('時'), { target: { value: '18' } })
    fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })
    fireEvent.keyDown(screen.getByLabelText('分'), { key: 'Enter' })
    expect(onWorkEnd).toHaveBeenCalledWith('18:30')
  })
})

describe('SessionList フッターボタン遷移', () => {
  beforeEach(() => { mockDayStore = {}; setDailyDay.mockClear() })

  it('breakStart=null のとき「休憩」ボタンが表示される', () => {
    renderWithProvider(<SessionList sessions={[]} workStart="09:00" breakStart={null} />)
    expect(screen.getByRole('button', { name: '休憩' })).toBeDefined()
  })

  it('「休憩」を押すと onBreakStart が呼ばれる', async () => {
    const user = userEvent.setup()
    const onBreakStart = vi.fn()
    renderWithProvider(<SessionList sessions={[]} workStart="09:00" breakStart={null} onBreakStart={onBreakStart} />)
    await user.click(screen.getByRole('button', { name: '休憩' }))
    expect(onBreakStart).toHaveBeenCalled()
  })

  it('breakStart あり breakEnd=null のとき「休憩終了」が表示される', () => {
    renderWithProvider(<SessionList sessions={[]} workStart="09:00" breakStart="12:00" breakEnd={null} />)
    expect(screen.getByRole('button', { name: '休憩終了' })).toBeDefined()
  })

  it('「休憩終了」を押すと onBreakEnd が呼ばれる', async () => {
    const user = userEvent.setup()
    const onBreakEnd = vi.fn()
    renderWithProvider(<SessionList sessions={[]} workStart="09:00" breakStart="12:00" breakEnd={null} onBreakEnd={onBreakEnd} />)
    await user.click(screen.getByRole('button', { name: '休憩終了' }))
    expect(onBreakEnd).toHaveBeenCalled()
  })

  it('breakStart あり breakEnd あり のとき「終了」が表示される', () => {
    renderWithProvider(<SessionList sessions={[]} workStart="09:00" breakStart="12:00" breakEnd="13:00" />)
    expect(screen.getByRole('button', { name: '終了' })).toBeDefined()
  })
})

describe('SessionList — ページをまたぐ並び替え', () => {
  const fiveSessions: Session[] = ['1', '2', '3', '4', '5'].map(id =>
    makeSession({ id, taskId: id, name: `ジュース${id}` })
  )

  // jsdom には DragEvent が無いため、clientX と dataTransfer を持つ MouseEvent で代用する
  function makeDragEvent(type: string, clientX = 0): MouseEvent {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX })
    Object.defineProperty(ev, 'dataTransfer', {
      value: { effectAllowed: '', dropEffect: '' },
    })
    return ev
  }

  it('2ページ目のタイマーをドラッグ中にページを戻して1ページ目に入れられる', async () => {
    vi.useFakeTimers()
    mockDayStore = {}
    setDailyDay.mockClear()
    try {
      const { container } = renderWithProvider(<SessionList sessions={fiveSessions} today="2026-02-25" />)
      const getUl = () => container.querySelector('ul')!

      // 2ページ目へ（ページサイズ4なので ジュース5 は2ページ目）
      fireEvent.wheel(getUl(), { deltaY: 100 })
      expect(screen.getByText('ジュース5')).toBeInTheDocument()
      expect(screen.queryByText('ジュース1')).not.toBeInTheDocument()

      // ジュース5 をドラッグ開始し、リスト左端でホールド → 400ms でページが戻る
      const li5 = screen.getByText('ジュース5').closest('li')!
      fireEvent(li5, makeDragEvent('dragstart'))
      fireEvent(getUl(), makeDragEvent('dragover', 10))
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(screen.getByText('ジュース1')).toBeInTheDocument()
      expect(screen.queryByText('ジュース5')).not.toBeInTheDocument()

      // 1ページ目の ジュース1 の上にドロップ（ドラッグ元の li5 は既にアンマウント済み。
      // 実ブラウザでは dragend が React に届かないため、drop で確定できる必要がある）
      const li1 = screen.getByText('ジュース1').closest('li')!
      fireEvent(li1, makeDragEvent('dragover', 200))
      fireEvent(li1, makeDragEvent('drop', 200))

      // setDailyDay が新しい順序で呼ばれていることを確認する
      expect(setDailyDay).toHaveBeenCalledWith(
        '2026-02-25',
        expect.objectContaining({ sessionOrder: ['5', '1', '2', '3', '4'] })
      )
      // 1ページ目の先頭が ジュース5 になっている
      expect(screen.getByText('ジュース5')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
