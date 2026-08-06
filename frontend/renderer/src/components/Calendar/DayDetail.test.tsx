import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

  it('行をダブルクリックすると編集ダイアログがセッションの値で開く', async () => {
    const user = userEvent.setup()
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={vi.fn()} />)
    await user.dblClick(screen.getByText('企画書作業'))
    expect(screen.getByText('タイマーを編集')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('企画書作業')
    expect(screen.getByPlaceholderText('PJコード')).toHaveValue('P001')
    expect(screen.getByPlaceholderText('作業区分')).toHaveValue('設計')
    expect(within(screen.getByLabelText('開始時刻')).getByLabelText('時')).toHaveValue('10')
    expect(within(screen.getByLabelText('終了時刻')).getByLabelText('分')).toHaveValue('45')
  })

  it('編集ボタンは表示されない（ダブルクリックと右クリックメニューに移行）', () => {
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
  })

  it('右クリックメニューの「編集」で編集ダイアログが開く', async () => {
    const user = userEvent.setup()
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={vi.fn()} />)
    fireEvent.contextMenu(screen.getByRole('listitem'))
    await user.click(screen.getByText('編集'))
    expect(screen.getByText('タイマーを編集')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('作業名（必須）')).toHaveValue('企画書作業')
  })

  it('名前を変更して保存するとonUpdateが呼ばれる', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.clear(screen.getByPlaceholderText('作業名（必須）'))
    await user.type(screen.getByPlaceholderText('作業名（必須）'), '新しい作業名{Enter}')
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい作業名' }))
  })

  it('時刻を持たない記録は分を変更して保存するとtotalTimeが反映される', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const legacy = { ...session, times: [] }
    render(<DayDetail date="2026-02-25" sessions={[legacy]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.clear(screen.getByPlaceholderText('分'))
    await user.type(screen.getByPlaceholderText('分'), '90')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ totalTime: 90 }))
  })

  it('Escapeキーでダイアログが閉じonUpdateを呼ばない', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={onUpdate} />)
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
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    await user.clear(screen.getByPlaceholderText('作業名（必須）'))
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

describe('DayDetail の集計フッター', () => {
  it('その日の開始時刻と終了時刻を表示する', () => {
    render(<DayDetail date="2026-02-25" sessions={[session]} />)
    expect(screen.getByText('10:00 – 10:45')).toBeInTheDocument()
  })

  it('稼働中の区間があるときは終了時刻を「稼働中」と表示する', () => {
    const running: Session = {
      ...session,
      times: [{ startTime: '2026-02-25T10:00:00', endTime: null }],
    }
    render(<DayDetail date="2026-02-25" sessions={[running]} />)
    expect(screen.getByText('10:00 – 稼働中')).toBeInTheDocument()
  })

  it('記録がある日はフッターを表示する', () => {
    const { container } = render(<DayDetail date="2026-02-25" sessions={[session]} />)
    expect(container.querySelector('[data-day-summary]')).not.toBeNull()
    expect(screen.getByText(/注いだ時間/)).toBeInTheDocument()
  })

  it('記録が無い日は空のフッターを残さず、要素ごと消す', () => {
    const { container } = render(<DayDetail date="2026-02-25" sessions={[]} />)
    expect(container.querySelector('[data-day-summary]')).toBeNull()
  })

  it('週次分析ボタンはツールバーへ移したのでフッターには置かない', () => {
    render(<DayDetail date="2026-02-25" sessions={[session]} />)
    expect(screen.queryByRole('button', { name: '週次分析' })).not.toBeInTheDocument()
  })
})

describe('DayDetail の区間編集', () => {
  it('編集ダイアログに既存の区間が入る', async () => {
    const user = userEvent.setup()
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={vi.fn()} />)
    await user.dblClick(screen.getByText('企画書作業'))
    expect(screen.getByText('合計: 45分')).toBeInTheDocument()
  })

  it('区間を編集して保存すると times と totalTime の両方が更新される', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<DayDetail date="2026-02-25" sessions={[session]} onUpdate={onUpdate} />)
    await user.dblClick(screen.getByText('企画書作業'))
    // 終了時刻の「時」を 12 に変える（10:45 → 12:45）。
    // TimeField は role="group" + aria-label を持つ div の中に「時」「分」の input を持つ
    const endGroup = screen.getByLabelText('終了時刻')
    fireEvent.change(within(endGroup).getByLabelText('時'), { target: { value: '12' } })
    await user.click(screen.getByRole('button', { name: '保存' }))
    const updated = onUpdate.mock.calls[0][0]
    expect(updated.times[0].endTime).toBe('2026-02-25T12:45:00')
    expect(updated.totalTime).toBe(165)
  })

  it('時刻を持たない記録はレガシーモードで開く', async () => {
    const user = userEvent.setup()
    const legacy = { ...session, times: [] }
    render(<DayDetail date="2026-02-25" sessions={[legacy]} onUpdate={vi.fn()} />)
    await user.dblClick(screen.getByText('企画書作業'))
    expect(screen.getByPlaceholderText('分')).toBeInTheDocument()
  })
})

describe('DayDetail の展開表示', () => {
  it('初期状態では区間を出さない', () => {
    const { container } = render(<DayDetail date="2026-02-25" sessions={[session]} />)
    expect(container.querySelector('[data-session-intervals]')).toBeNull()
  })

  it('行をクリックすると区間が出る', async () => {
    const user = userEvent.setup()
    render(<DayDetail date="2026-02-25" sessions={[session]} />)
    await user.click(screen.getByText('企画書作業'))
    // 日次フッターにも同じ "10:00 – 10:45" が出るため、行の中に絞って検証する
    // （フッターは常時表示のため screen.getByText だと複数ヒットする）
    const row = screen.getByText('企画書作業').closest('li')!
    expect(within(row).getByText('10:00 – 10:45')).toBeInTheDocument()
  })

  it('もう一度クリックすると閉じる', async () => {
    const user = userEvent.setup()
    const { container } = render(<DayDetail date="2026-02-25" sessions={[session]} />)
    await user.click(screen.getByText('企画書作業'))
    await user.click(screen.getByText('企画書作業'))
    expect(container.querySelector('[data-session-intervals]')).toBeNull()
  })
})
