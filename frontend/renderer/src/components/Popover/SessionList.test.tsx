import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { SessionList } from './SessionList'
import { DailyDataProvider } from '../../daily/DailyDataContext'
import type { Session } from '../../types/session'
import type { DailyMonth } from '../../../../shared/types'
import { interval, makeSession } from '../../test/factories'

const TODAY = '2026-02-25'

const setDailyDay = vi.fn()
let dayStore: DailyMonth['days'] = {}
let dailyChanged: (p: { yearMonth: string }) => void = () => {}
vi.stubGlobal('bridge', {
  getDailyMonth: () => Promise.resolve({ version: 1, days: dayStore }),
  setDailyDay,
  onDailyChanged: (cb: (p: { yearMonth: string }) => void) => { dailyChanged = cb; return () => {} },
})

const session = (overrides: Partial<Session> = {}): Session => makeSession({
  id: '1',
  taskId: '1',
  name: '企画書作業',
  projectCode: 'P001',
  workCategory: '設計',
  times: [interval(`${TODAY}T10:00:00`, `${TODAY}T10:45:00`)],
  date: TODAY,
  totalTime: 45,
  ...overrides,
})

const twoSessions: Session[] = [
  session(),
  session({
    id: '2',
    taskId: '2',
    name: 'メール対応',
    projectCode: '',
    workCategory: '',
    times: [interval(`${TODAY}T11:00:00`, `${TODAY}T11:20:00`)],
    totalTime: 20,
  }),
]

const SUGGESTIONS = {
  names: [{ name: '資料作成', projectCode: 'P001', workCategory: '設計' }],
  projectCodes: ['P001', 'P002'],
  workCategories: ['設計', '会議'],
}

type Props = Partial<ComponentProps<typeof SessionList>>

function renderList(props: Props = {}) {
  return render(
    <DailyDataProvider>
      <SessionList sessions={[session()]} today={TODAY} {...props} />
    </DailyDataProvider>,
  )
}

const nameInput = () => screen.getByPlaceholderText('作業名（必須）')
const segment = (group: '開始時刻' | '終了時刻', part: '時' | '分') =>
  within(screen.getByLabelText(group)).getByLabelText(part)

function setTime(group: '開始時刻' | '終了時刻', hh: string, mm: string): void {
  fireEvent.change(segment(group, '時'), { target: { value: hh } })
  fireEvent.change(segment(group, '分'), { target: { value: mm } })
}

async function openEdit(): Promise<void> {
  await userEvent.click(screen.getAllByRole('button', { name: '編集' })[0])
}

/** 一覧の余白を右クリックして「追加」を選ぶ */
async function openAdd(container: HTMLElement): Promise<void> {
  fireEvent.contextMenu(container.firstChild as Element)
  await userEvent.click(screen.getByRole('button', { name: '追加' }))
}

beforeEach(() => {
  dayStore = {}
  setDailyDay.mockReset().mockResolvedValue(undefined)
})

describe('SessionList', () => {
  describe('表示', () => {
    it('セッションの名前を一覧に出す', () => {
      renderList({ sessions: twoSessions })

      expect(screen.getByText('企画書作業')).toBeInTheDocument()
      expect(screen.getByText('メール対応')).toBeInTheDocument()
    })

    it('PJコードと作業区分をタグで出す', () => {
      renderList()

      expect(screen.getByText('P001')).toBeInTheDocument()
      expect(screen.getByText('設計')).toBeInTheDocument()
    })

    it('全セッションの合計時間を出す（45 + 20 = 65分）', () => {
      renderList({ sessions: twoSessions })

      expect(screen.getByText(/65分/)).toBeInTheDocument()
    })

    it('セッションが無ければ、開始の操作を案内する', () => {
      renderList({ sessions: [] })

      expect(screen.getByText('まだジュースを注いでいません')).toBeInTheDocument()
      expect(screen.getByText('作業名を入力して「注ぐ」で開始できます')).toBeInTheDocument()
    })

    it('セッション行には操作ヒントの吹き出しを付けない', () => {
      // 見た目が煩雑なため、行のツールチップ（title / Radix Tooltip）は廃止した
      renderList()

      const row = screen.getByText('企画書作業').closest('[data-session-item]')

      expect(row).not.toHaveAttribute('title')
      expect(row).not.toHaveAttribute('data-state')
    })

    it('勤務時間の欄にツアー用のアンカーを付ける', () => {
      renderList({ workStart: '09:00' })

      const total = screen.getByText(/今日注いだ時間/)

      expect(total.closest('[data-tour="demo-worktime"]')).not.toBeNull()
    })
  })

  describe('保存済みの並び順の追従', () => {
    it('消えたセッションの id を並び順から取り除く', async () => {
      dayStore = { [TODAY]: { sessionOrder: ['2', '1', 'STALE'] } }

      renderList({ sessions: twoSessions })

      await waitFor(() => expect(setDailyDay).toHaveBeenCalledWith(TODAY, { sessionOrder: ['2', '1'] }))
    })

    it('並び順に無い新しいセッションを末尾に足す', async () => {
      dayStore = { [TODAY]: { sessionOrder: ['2', '1'] } }
      const withNew = [...twoSessions, session({ id: '3', taskId: '3', name: '新規作業' })]

      renderList({ sessions: withNew })

      await waitFor(() => expect(setDailyDay).toHaveBeenCalledWith(TODAY, { sessionOrder: ['2', '1', '3'] }))
    })

    it('並び順が一覧と一致していれば書き直さない', async () => {
      dayStore = { [TODAY]: { sessionOrder: ['2', '1'] } }

      renderList({ sessions: twoSessions })
      await act(async () => {})

      expect(setDailyDay).not.toHaveBeenCalled()
    })

    it('並び順の保存が失敗し続けても、同じ内容の保存を繰り返さない', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      // 保存は失敗し続ける。再試行が止まらない実装でもテストが終わるよう、10回目以降は保存を保留にする
      for (let i = 0; i < 10; i++) setDailyDay.mockRejectedValueOnce(new Error('disk full'))
      setDailyDay.mockReturnValue(new Promise(() => {}))
      dayStore = { [TODAY]: { sessionOrder: ['2', '1', 'STALE'] } }

      renderList({ sessions: twoSessions })
      await waitFor(() => expect(setDailyDay).toHaveBeenCalled())
      for (let i = 0; i < 5; i++) await act(async () => {})

      expect(setDailyDay).toHaveBeenCalledTimes(1)
    })

    it('並び順が別の内容に変わったあとに同じ同期が必要になったら、保存を試みる', async () => {
      dayStore = { [TODAY]: { sessionOrder: ['2', '1', 'STALE'] } }
      renderList({ sessions: twoSessions })
      await waitFor(() => expect(setDailyDay).toHaveBeenCalledTimes(1))

      dayStore = { [TODAY]: { sessionOrder: ['2', '1', 'OTHER'] } }
      await act(async () => { dailyChanged({ yearMonth: TODAY.slice(0, 7) }) })

      await waitFor(() => expect(setDailyDay).toHaveBeenCalledTimes(2))
    })
  })

  describe('編集', () => {
    it('編集ボタンで、セッションの値を入れた編集ダイアログを開く', async () => {
      renderList({ onUpdate: vi.fn() })

      await openEdit()

      expect(screen.getByText('タイマーを編集')).toBeInTheDocument()
      expect(nameInput()).toHaveValue('企画書作業')
      expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P001')
      expect(screen.getByPlaceholderText('作業区分')).toHaveValue('設計')
      expect([segment('開始時刻', '時'), segment('終了時刻', '分')].map(el => (el as HTMLInputElement).value)).toEqual(['10', '45'])
    })

    it('右クリックメニューの「編集」でも編集ダイアログを開く', async () => {
      renderList({ onUpdate: vi.fn() })
      fireEvent.contextMenu(screen.getByRole('listitem'))

      await userEvent.click(screen.getByText('編集'))

      expect(nameInput()).toHaveValue('企画書作業')
    })

    it('保存で、編集した内容のセッションを onUpdate に渡す', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined)
      renderList({ onUpdate })
      await openEdit()
      await userEvent.clear(nameInput())
      await userEvent.type(nameInput(), '新しい名前')

      await userEvent.click(screen.getByRole('button', { name: '保存' }))

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: '新しい名前' }))
    })

    it('Enter でも保存する', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined)
      renderList({ onUpdate })
      await openEdit()
      await userEvent.clear(nameInput())

      await userEvent.type(nameInput(), '新しい名前{Enter}')

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい名前' }))
    })

    it('区間を変えて保存すると、合計を区間から算出し直す', async () => {
      // 10:00–10:45 の終了を 12:45 にして 165分にする
      const onUpdate = vi.fn().mockResolvedValue(undefined)
      renderList({ onUpdate })
      await openEdit()
      fireEvent.change(segment('終了時刻', '時'), { target: { value: '12' } })

      await userEvent.click(screen.getByRole('button', { name: '保存' }))

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ totalTime: 165 }))
    })

    it('時刻を持たない記録は、分の入力で合計を変える', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined)
      renderList({ sessions: [session({ times: [] })], onUpdate })
      await openEdit()
      await userEvent.clear(screen.getByPlaceholderText('分'))
      await userEvent.type(screen.getByPlaceholderText('分'), '90')

      await userEvent.click(screen.getByRole('button', { name: '保存' }))

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ totalTime: 90 }))
    })

    it('計測中の区間の開始を変えたら、タイマーの開始時刻も直す', async () => {
      const onAdjustStartTime = vi.fn()
      const running = session({ times: [interval(`${TODAY}T10:00:00`, null)], totalTime: 0 })
      renderList({ sessions: [running], onUpdate: vi.fn().mockResolvedValue(undefined), onAdjustStartTime })
      await openEdit()
      fireEvent.change(segment('開始時刻', '時'), { target: { value: '09' } })

      await userEvent.click(screen.getByRole('button', { name: '保存' }))

      expect(onAdjustStartTime).toHaveBeenCalledWith(new Date(`${TODAY}T09:00:00`).getTime())
    })

    it('作業名が空なら保存しない', async () => {
      const onUpdate = vi.fn()
      renderList({ onUpdate })
      await openEdit()
      await userEvent.clear(nameInput())

      await userEvent.keyboard('{Enter}')

      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('Escape でダイアログを閉じ、保存しない', async () => {
      const onUpdate = vi.fn()
      renderList({ onUpdate })
      await openEdit()
      await userEvent.type(nameInput(), '変更途中')

      await userEvent.keyboard('{Escape}')

      expect(screen.queryByText('タイマーを編集')).not.toBeInTheDocument()
      expect(onUpdate).not.toHaveBeenCalled()
    })
  })

  describe('右クリックメニュー', () => {
    it('セッションを右クリックするとメニューを出す', () => {
      renderList({ onDelete: vi.fn() })

      fireEvent.contextMenu(screen.getByRole('listitem'))

      expect(screen.getByText('流す')).toBeInTheDocument()
    })

    it('「流す」を選ぶと確認を出す', () => {
      renderList({ onDelete: vi.fn() })
      fireEvent.contextMenu(screen.getByRole('listitem'))

      fireEvent.click(screen.getByText('流す'))

      expect(screen.getByText('本当に流しますか？')).toBeInTheDocument()
    })

    it('確認で「流す」を押すと、そのセッションを削除する', () => {
      const onDelete = vi.fn()
      renderList({ onDelete })
      fireEvent.contextMenu(screen.getByRole('listitem'))
      fireEvent.click(screen.getByText('流す'))

      fireEvent.click(screen.getByRole('button', { name: '流す' }))

      expect(onDelete).toHaveBeenCalledWith('1')
    })

    it('確認でキャンセルすると削除しない', () => {
      const onDelete = vi.fn()
      renderList({ onDelete })
      fireEvent.contextMenu(screen.getByRole('listitem'))
      fireEvent.click(screen.getByText('流す'))

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

      expect(onDelete).not.toHaveBeenCalled()
    })

    it('メニューの外をクリックすると閉じる', async () => {
      renderList({ onDelete: vi.fn() })
      fireEvent.contextMenu(screen.getByRole('listitem'))

      fireEvent.mouseDown(document.body)

      await waitFor(() => expect(screen.queryByText('流す')).not.toBeInTheDocument())
    })

    it('Escape で閉じる', async () => {
      renderList({ onDelete: vi.fn() })
      fireEvent.contextMenu(screen.getByRole('listitem'))

      fireEvent.keyDown(document, { key: 'Escape' })

      await waitFor(() => expect(screen.queryByText('流す')).not.toBeInTheDocument())
    })
  })

  describe('「追加で注ぐ」', () => {
    it('押すと、そのセッションで延長を始める', async () => {
      const onStartMore = vi.fn()
      renderList({ sessions: twoSessions, isRunning: false, onStartMore })

      await userEvent.click(screen.getAllByRole('button', { name: '追加で注ぐ' })[0])

      expect(onStartMore).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: '1' }))
    })

    it('計測中は出さない', () => {
      renderList({ sessions: twoSessions, isRunning: true, onStartMore: vi.fn() })

      expect(screen.queryByRole('button', { name: '追加で注ぐ' })).not.toBeInTheDocument()
    })
  })

  describe('手動追加', () => {
    it('今日の日付と結合した区間で onAdd を呼ぶ', async () => {
      const onAdd = vi.fn()
      const { container } = renderList({ sessions: [], onAdd })
      await openAdd(container)
      await userEvent.type(nameInput(), '実装')
      setTime('開始時刻', '09', '00')
      setTime('終了時刻', '09', '30')

      await userEvent.click(screen.getByRole('button', { name: '追加' }))

      expect(onAdd).toHaveBeenCalledWith({
        name: '実装',
        projectCode: '',
        workCategory: '',
        times: [interval(`${TODAY}T09:00:00`, `${TODAY}T09:30:00`)],
      })
    })

    it('作業名が空なら追加しない', async () => {
      const onAdd = vi.fn()
      const { container } = renderList({ sessions: [], onAdd })
      await openAdd(container)
      setTime('開始時刻', '09', '00')
      setTime('終了時刻', '09', '30')

      await userEvent.keyboard('{Enter}')

      expect(onAdd).not.toHaveBeenCalled()
    })

    it('開始時刻には、その日の最後の記録の終了時刻を入れておく', async () => {
      // twoSessions の最後の区間は 11:00–11:20
      const { container } = renderList({ sessions: twoSessions, workStart: '09:00', onAdd: vi.fn() })

      await openAdd(container)

      expect([segment('開始時刻', '時'), segment('開始時刻', '分')].map(el => (el as HTMLInputElement).value)).toEqual(['11', '20'])
    })

    it('記録が無い日は、開始時刻に勤務開始時刻を入れておく', async () => {
      const { container } = renderList({ sessions: [], workStart: '09:15', onAdd: vi.fn() })

      await openAdd(container)

      expect([segment('開始時刻', '時'), segment('開始時刻', '分')].map(el => (el as HTMLInputElement).value)).toEqual(['09', '15'])
    })

    it('途中まで入力して閉じても、次に開くと空になる（下書きは残さない）', async () => {
      const { container } = renderList({ sessions: [], onAdd: vi.fn() })
      await openAdd(container)
      await userEvent.type(nameInput(), '仕様検討')
      await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

      await openAdd(container)

      expect(nameInput()).toHaveValue('')
    })

    it('追加したあとに開いても空になる', async () => {
      const { container } = renderList({ sessions: [], onAdd: vi.fn() })
      await openAdd(container)
      await userEvent.type(nameInput(), '実装')
      setTime('開始時刻', '09', '00')
      setTime('終了時刻', '09', '30')
      await userEvent.click(screen.getByRole('button', { name: '追加' }))

      await openAdd(container)

      expect(nameInput()).toHaveValue('')
    })

    it('作業名の候補を選ぶと、PJコード・作業区分も埋まる', async () => {
      const { container } = renderList({ sessions: [], onAdd: vi.fn(), suggestions: SUGGESTIONS })
      await openAdd(container)
      await userEvent.click(nameInput())

      await userEvent.click(screen.getByText('資料作成'))

      expect(nameInput()).toHaveValue('資料作成')
      expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P001')
      expect(screen.getByPlaceholderText('作業区分')).toHaveValue('設計')
    })

    it('PJコードの候補を選べる', async () => {
      const { container } = renderList({ sessions: [], onAdd: vi.fn(), suggestions: SUGGESTIONS })
      await openAdd(container)
      await userEvent.click(screen.getByPlaceholderText('PJコード'))

      await userEvent.click(screen.getByText('P002'))

      expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P002')
    })

    describe('候補を開いているときの Escape', () => {
      it('1回目は候補だけを閉じる', async () => {
        const { container } = renderList({ sessions: [], onAdd: vi.fn(), suggestions: SUGGESTIONS })
        await openAdd(container)
        await userEvent.click(nameInput())

        await userEvent.keyboard('{Escape}')

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
        expect(nameInput()).toBeInTheDocument()
      })

      it('2回目でダイアログを閉じる', async () => {
        const { container } = renderList({ sessions: [], onAdd: vi.fn(), suggestions: SUGGESTIONS })
        await openAdd(container)
        await userEvent.click(nameInput())
        await userEvent.keyboard('{Escape}')

        await userEvent.keyboard('{Escape}')

        expect(screen.queryByPlaceholderText('作業名（必須）')).not.toBeInTheDocument()
      })
    })
  })

  describe('勤務時間の欄のボタン', () => {
    it('休憩前は「休憩」を出し、押すと onBreakStart を呼ぶ', async () => {
      const onBreakStart = vi.fn()
      renderList({ sessions: [], workStart: '09:00', breakStart: null, onBreakStart })

      await userEvent.click(screen.getByRole('button', { name: '休憩' }))

      expect(onBreakStart).toHaveBeenCalledOnce()
    })

    it('休憩中は「休憩終了」を出し、押すと onBreakEnd を呼ぶ', async () => {
      const onBreakEnd = vi.fn()
      renderList({ sessions: [], workStart: '09:00', breakStart: '12:00', breakEnd: null, onBreakEnd })

      await userEvent.click(screen.getByRole('button', { name: '休憩終了' }))

      expect(onBreakEnd).toHaveBeenCalledOnce()
    })

    it('休憩が終わったら「終了」を出す', () => {
      renderList({ sessions: [], workStart: '09:00', breakStart: '12:00', breakEnd: '13:00' })

      expect(screen.getByRole('button', { name: '終了' })).toBeInTheDocument()
    })

    it('「終了」で時刻を選んで確定すると、その時刻で onWorkEnd を呼ぶ', () => {
      const onWorkEnd = vi.fn()
      renderList({ workStart: '09:00', breakStart: '12:00', breakEnd: '13:00', onWorkEnd })
      fireEvent.click(screen.getByRole('button', { name: '終了' }))
      fireEvent.change(screen.getByLabelText('時'), { target: { value: '18' } })
      fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })

      fireEvent.click(screen.getByRole('button', { name: '確定' }))

      expect(onWorkEnd).toHaveBeenCalledWith('18:30')
    })

    it('時刻の入力欄で Enter を押しても確定する', () => {
      const onWorkEnd = vi.fn()
      renderList({ workStart: '09:00', breakStart: '12:00', breakEnd: '13:00', onWorkEnd })
      fireEvent.click(screen.getByRole('button', { name: '終了' }))
      fireEvent.change(screen.getByLabelText('時'), { target: { value: '18' } })
      fireEvent.change(screen.getByLabelText('分'), { target: { value: '30' } })

      fireEvent.keyDown(screen.getByLabelText('分'), { key: 'Enter' })

      expect(onWorkEnd).toHaveBeenCalledWith('18:30')
    })
  })

  describe('ページ送り（1ページ4件）', () => {
    const fiveSessions = ['1', '2', '3', '4', '5'].map(id => session({ id, taskId: id, name: `ジュース${id}` }))

    it('下へホイールすると次のページを出す', () => {
      const { container } = renderList({ sessions: fiveSessions })

      fireEvent.wheel(container.querySelector('ul')!, { deltaY: 100 })

      expect(screen.getByText('ジュース5')).toBeInTheDocument()
      expect(screen.queryByText('ジュース1')).not.toBeInTheDocument()
    })

    it('上へホイールすると前のページへ戻る', () => {
      const { container } = renderList({ sessions: fiveSessions })
      fireEvent.wheel(container.querySelector('ul')!, { deltaY: 100 })

      fireEvent.wheel(container.querySelector('ul')!, { deltaY: -100 })

      expect(screen.getByText('ジュース1')).toBeInTheDocument()
    })

    describe('ページをまたぐ並び替え', () => {
      // jsdom には DragEvent が無いため、clientX と dataTransfer を持つ MouseEvent で代用する
      function dragEvent(type: string, clientX = 0): MouseEvent {
        const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX })
        Object.defineProperty(ev, 'dataTransfer', { value: { effectAllowed: '', dropEffect: '', setData: () => {} } })
        return ev
      }

      afterEach(() => { vi.useRealTimers() })

      it('2ページ目の項目を、ページを戻して1ページ目の先頭に入れられる', () => {
        vi.useFakeTimers()
        const { container } = renderList({ sessions: fiveSessions })
        const list = () => container.querySelector('ul')!
        fireEvent.wheel(list(), { deltaY: 100 })
        // ジュース5 を掴んで左端に 400ms 留まり、1ページ目へ戻る
        fireEvent(screen.getByText('ジュース5').closest('li')!, dragEvent('dragstart'))
        fireEvent(list(), dragEvent('dragover', 10))
        act(() => { vi.advanceTimersByTime(400) })
        // 掴んだ要素はページ切替でアンマウント済み。実ブラウザでは dragend が届かないので drop で確定する
        const first = screen.getByText('ジュース1').closest('li')!
        fireEvent(first, dragEvent('dragover', 200))

        fireEvent(first, dragEvent('drop', 200))

        expect(setDailyDay).toHaveBeenCalledWith(TODAY, { sessionOrder: ['5', '1', '2', '3', '4'] })
      })
    })
  })
})
