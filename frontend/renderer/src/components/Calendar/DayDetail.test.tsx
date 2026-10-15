import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { DayDetail } from './DayDetail'
import type { Session } from '../../types/session'
import { interval, makeSession } from '../../test/factories'

const DATE = '2026-02-25'

const session = (overrides: Partial<Session> = {}): Session => makeSession({
  id: '1',
  taskId: '1',
  name: '企画書作業',
  projectCode: 'P001',
  workCategory: '設計',
  times: [interval(`${DATE}T10:00:00`, `${DATE}T10:45:00`)],
  date: DATE,
  totalTime: 45,
  ...overrides,
})

type Props = ComponentProps<typeof DayDetail>

function renderDetail(props: Partial<Props> = {}) {
  return render(<DayDetail date={DATE} sessions={[session()]} {...props} />)
}

const nameInput = () => screen.getByPlaceholderText('作業名（必須）')
const segment = (group: string, part: string) => within(screen.getByLabelText(group)).getByLabelText(part)

async function openEdit(): Promise<void> {
  await userEvent.click(screen.getAllByRole('button', { name: '編集' })[0])
}

describe('DayDetail', () => {
  describe('表示', () => {
    it('日付が選ばれていなければ選択を促す', () => {
      renderDetail({ date: null, sessions: [] })

      expect(screen.getByText('日付を選択してください')).toBeInTheDocument()
    })

    it('セッションの名前と、行・合計の分を出す', () => {
      renderDetail()

      expect(screen.getByText('企画書作業')).toBeInTheDocument()
      expect(screen.getAllByText(/45分/)).toHaveLength(2)
    })

    it('同じ名前でも別のセッションは別の行に出す', () => {
      const sessions = [
        session({ id: '1', name: '会議', times: [interval(`${DATE}T09:00:00`, `${DATE}T09:30:00`)] }),
        session({ id: '2', name: '会議', times: [interval(`${DATE}T14:00:00`, `${DATE}T14:30:00`)] }),
      ]

      renderDetail({ sessions })

      expect(screen.getAllByText('会議')).toHaveLength(2)
    })

    it('並び順が保存されていればその順に出す', () => {
      const sessions = [session({ id: 'a', name: 'A' }), session({ id: 'b', name: 'B' })]

      renderDetail({ sessions, sessionOrder: ['b', 'a'] })

      expect(screen.getAllByRole('listitem').map(li => li.textContent?.slice(0, 1))).toEqual(['B', 'A'])
    })
  })

  describe('その日の集計（フッター）', () => {
    it('最初の開始と最後の終了を出す', () => {
      renderDetail()

      expect(screen.getByText('10:00 – 10:45')).toBeInTheDocument()
    })

    it('計測中の区間があれば、終了の代わりに「稼働中」と出す', () => {
      renderDetail({ sessions: [session({ times: [interval(`${DATE}T10:00:00`, null)] })] })

      expect(screen.getByText('10:00 – 稼働中')).toBeInTheDocument()
    })

    it('記録がある日は注いだ時間を出す', () => {
      renderDetail()

      expect(screen.getByText(/注いだ時間/)).toBeInTheDocument()
    })

    it('記録が無い日はフッターごと出さない', () => {
      const { container } = renderDetail({ sessions: [] })

      expect(container.querySelector('[data-day-summary]')).toBeNull()
    })

    it('週次分析ボタンは置かない（ツールバーへ移した）', () => {
      renderDetail()

      expect(screen.queryByRole('button', { name: '週次分析' })).not.toBeInTheDocument()
    })
  })

  describe('展開', () => {
    it('最初は区間を出さない', () => {
      const { container } = renderDetail()

      expect(container.querySelector('[data-session-intervals]')).toBeNull()
    })

    it('行をクリックすると、その行に区間を出す', async () => {
      renderDetail()

      await userEvent.click(screen.getByText('企画書作業'))

      // フッターにも同じ時刻が出るため、行の中に絞って確かめる
      const row = screen.getByText('企画書作業').closest('li')!
      expect(within(row).getByText('10:00 – 10:45')).toBeInTheDocument()
    })

    it('もう一度クリックすると閉じる', async () => {
      const { container } = renderDetail()
      await userEvent.click(screen.getByText('企画書作業'))

      await userEvent.click(screen.getByText('企画書作業'))

      expect(container.querySelector('[data-session-intervals]')).toBeNull()
    })
  })

  describe('長い文字列の収まり', () => {
    const LONG_NAME = 'とても長い作業名がここに入っていて一行では収まらない'

    // jsdom はレイアウトを計算しないため、省略表示はクラスで確かめる（見た目の回帰の検知用）
    it('作業名は1行に収めて省略記号で切る', () => {
      renderDetail({ sessions: [session({ name: LONG_NAME })] })

      const name = screen.getByText(LONG_NAME)

      expect(name).toHaveClass('truncate')
      expect(name).not.toHaveClass('break-words')
    })

    it('作業名の全文を title で読める', () => {
      renderDetail({ sessions: [session({ name: LONG_NAME })] })

      expect(screen.getByText(LONG_NAME)).toHaveAttribute('title', LONG_NAME)
    })

    it('PJコードと作業区分を1行に並べる', () => {
      const { container } = renderDetail()

      expect(container.querySelector('[data-session-meta]')).toHaveClass('flex-nowrap')
    })

    it('PJコードも作業区分も無ければその行を出さない', () => {
      const { container } = renderDetail({ sessions: [session({ projectCode: '', workCategory: '' })] })

      expect(container.querySelector('[data-session-meta]')).toBeNull()
    })

    it('長い PJコードと作業区分は、どちらも縮んで省略され title で全文を読める', () => {
      // shrink-0 と truncate は両立しない（shrink-0 だと「…」なしで途中から切れる）
      const long = session({ projectCode: 'PROJECT-CODE-とても長いプロジェクトコード', workCategory: '作業区分もとても長い名前になっている' })
      const { container } = renderDetail({ sessions: [long] })

      const [codeChip, categoryChip] = Array.from(container.querySelector('[data-session-meta]')!.children)

      expect(codeChip).toHaveClass('truncate')
      expect(codeChip).not.toHaveClass('shrink-0')
      expect(codeChip).toHaveAttribute('title', long.projectCode)
      expect(categoryChip).toHaveClass('truncate')
      expect(categoryChip).toHaveAttribute('title', long.workCategory)
    })
  })

  describe('編集', () => {
    it('onUpdate が無ければ編集ボタンを出さない', () => {
      renderDetail()

      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    })

    it('編集ボタンで、セッションの値を入れた編集ダイアログを開く', async () => {
      renderDetail({ onUpdate: vi.fn() })

      await openEdit()

      expect(nameInput()).toHaveValue('企画書作業')
      expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P001')
      expect(screen.getByPlaceholderText('作業区分')).toHaveValue('設計')
      expect(screen.getByText('合計: 45分')).toBeInTheDocument()
      expect([segment('開始時刻', '時'), segment('終了時刻', '分')].map(el => (el as HTMLInputElement).value)).toEqual(['10', '45'])
    })

    it('時刻を持たない記録は「分」の入力で開く', async () => {
      renderDetail({ sessions: [session({ times: [] })], onUpdate: vi.fn() })

      await openEdit()

      expect(screen.getByPlaceholderText('分')).toBeInTheDocument()
    })

    it('右クリックメニューの「編集」でも開く', async () => {
      renderDetail({ onUpdate: vi.fn() })
      fireEvent.contextMenu(screen.getByRole('listitem'))

      await userEvent.click(screen.getByText('編集'))

      expect(nameInput()).toHaveValue('企画書作業')
    })

    it('onUpdate が無ければ右クリックメニューを出さない', () => {
      renderDetail()

      fireEvent.contextMenu(screen.getByRole('listitem'))

      expect(screen.queryByText('編集')).not.toBeInTheDocument()
    })

    it('編集ボタンを押しても展開は切り替えない', async () => {
      const { container } = renderDetail({ onUpdate: vi.fn() })

      await openEdit()

      expect(container.querySelector('[data-session-intervals]')).toBeNull()
    })

    it('行のダブルクリックでは編集を開かない', async () => {
      renderDetail({ onUpdate: vi.fn() })

      await userEvent.dblClick(screen.getByText('企画書作業'))

      expect(screen.queryByText('タイマーを編集')).not.toBeInTheDocument()
    })

    it('名前を変えて Enter で保存する', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined)
      renderDetail({ onUpdate })
      await openEdit()
      await userEvent.clear(nameInput())

      await userEvent.type(nameInput(), '新しい作業名{Enter}')

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい作業名' }))
    })

    it('区間を変えて保存すると、区間と合計の両方を更新する', async () => {
      // 10:00–10:45 の終了を 12:45 に変える
      const onUpdate = vi.fn().mockResolvedValue(undefined)
      renderDetail({ onUpdate })
      await openEdit()
      fireEvent.change(segment('終了時刻', '時'), { target: { value: '12' } })

      await userEvent.click(screen.getByRole('button', { name: '保存' }))

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        times: [interval(`${DATE}T10:00:00`, `${DATE}T12:45:00`)],
        totalTime: 165,
      }))
    })

    it('時刻を持たない記録は、分の入力で合計を変える', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined)
      renderDetail({ sessions: [session({ times: [] })], onUpdate })
      await openEdit()
      await userEvent.clear(screen.getByPlaceholderText('分'))
      await userEvent.type(screen.getByPlaceholderText('分'), '90')

      await userEvent.click(screen.getByRole('button', { name: '保存' }))

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ totalTime: 90 }))
    })

    it('作業名が空なら保存しない', async () => {
      const onUpdate = vi.fn()
      renderDetail({ onUpdate })
      await openEdit()
      await userEvent.clear(nameInput())

      await userEvent.keyboard('{Enter}')

      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('Escape でダイアログを閉じ、保存しない', async () => {
      const onUpdate = vi.fn()
      renderDetail({ onUpdate })
      await openEdit()
      await userEvent.type(nameInput(), '変更途中')

      await userEvent.keyboard('{Escape}')

      expect(screen.queryByText('タイマーを編集')).not.toBeInTheDocument()
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('保存に失敗しても例外を外へ漏らさない', async () => {
      const onUpdate = vi.fn().mockRejectedValue(new Error('disk full'))
      renderDetail({ onUpdate })
      await openEdit()

      await userEvent.click(screen.getByRole('button', { name: '保存' }))

      expect(onUpdate).toHaveBeenCalledOnce()
    })
  })
})
