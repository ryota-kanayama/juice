// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DailyDataProvider } from '../../daily/DailyDataContext'
import { AttendanceReport } from './AttendanceReport'
import type { Session } from '../../types/session'
import type { DayRecord } from '../../../../shared/types'
import { makeSession } from '../../test/factories'

const TODAY = '2026-06-12'

const send = vi.hoisted(() => vi.fn())
vi.mock('../../repositories/attendanceRepository', () => ({
  attendanceRepository: { send: (text: string) => send(text) },
}))

const setDailyDay = vi.fn()
let day: DayRecord = {}
vi.stubGlobal('bridge', {
  getDailyMonth: () => Promise.resolve({ version: 1, days: { [TODAY]: day } }),
  setDailyDay,
  onDailyChanged: () => () => {},
})

const task = (overrides: Partial<Session> = {}): Session => makeSession({
  name: '作業',
  projectCode: 'P',
  workCategory: 'C',
  date: TODAY,
  times: [],
  totalTime: 480,
  ...overrides,
})

// 09:00〜18:00、休憩60分 → 実労働 480分
const FULL_DAY: DayRecord = { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }

/** 描画して、日次データの読み込み（出勤時刻の表示）を待つ */
async function renderReport(sessions: Session[] = [task()], record: DayRecord = FULL_DAY) {
  day = record
  const view = render(<DailyDataProvider><AttendanceReport sessions={sessions} today={TODAY} /></DailyDataProvider>)
  if (record.workStart) await screen.findByText(record.workStart)
  return view
}

const sendButton = (container: HTMLElement) => container.querySelector('[data-tour="att-send"]') as HTMLButtonElement

beforeEach(() => {
  send.mockReset().mockResolvedValue({ ok: true, status: 200, body: '{}' })
  setDailyDay.mockReset().mockResolvedValue(undefined)
})

describe('AttendanceReport', () => {
  describe('表示', () => {
    it('出勤・退勤・休憩を出す', async () => {
      await renderReport()

      expect(screen.getByText('18:00')).toBeInTheDocument()
      expect(screen.getByText('60分')).toBeInTheDocument()
    })

    it('記録が無い時刻は --:-- にする', async () => {
      await renderReport([task()], {})

      expect(await screen.findAllByText('--:--')).toHaveLength(2)
    })

    it('勤怠テキストを出す', async () => {
      await renderReport()

      expect(screen.getByText(/勤怠\s+09:00 18:00 60\s+P 作業 C 480/)).toBeInTheDocument()
    })

    it('コピー・送るボタンにツアー用のアンカーを付ける', async () => {
      const { container } = await renderReport()

      expect(container.querySelector('[data-tour="att-copy"]')).not.toBeNull()
      expect(container.querySelector('[data-tour="att-send"]')).not.toBeNull()
    })
  })

  describe('時刻・休憩の編集', () => {
    it.each([
      ['出勤', '09:00', '出勤時刻'],
      ['退勤', '18:00', '退勤時刻'],
      ['休憩', '60分', '休憩時間'],
    ])('%s をダブルクリックすると編集ダイアログを開く', async (_label, shown, title) => {
      await renderReport()

      fireEvent.dblClick(screen.getByText(shown))

      expect(await screen.findByText(title)).toBeInTheDocument()
    })

    it('休憩の分を確定すると保存する', async () => {
      await renderReport()
      fireEvent.dblClick(screen.getByText('60分'))
      fireEvent.change(await screen.findByRole('textbox'), { target: { value: '45' } })

      fireEvent.click(screen.getByRole('button', { name: '確定' }))

      expect(setDailyDay).toHaveBeenCalledWith(TODAY, { breakMinutes: 45 })
    })

    it('休憩に数でない値を入れても保存しない', async () => {
      await renderReport()
      fireEvent.dblClick(screen.getByText('60分'))
      fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'abc' } })

      fireEvent.click(screen.getByRole('button', { name: '確定' }))

      expect(setDailyDay).not.toHaveBeenCalled()
    })

    it('出勤時刻を確定すると保存する', async () => {
      await renderReport()
      fireEvent.dblClick(screen.getByText('09:00'))
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('時'), { target: { value: '08' } })

      fireEvent.click(screen.getByRole('button', { name: '確定' }))

      expect(setDailyDay).toHaveBeenCalledWith(TODAY, { workStart: '08:00' })
    })

    it('キャンセルすると保存しない', async () => {
      await renderReport()
      fireEvent.dblClick(screen.getByText('60分'))
      fireEvent.change(await screen.findByRole('textbox'), { target: { value: '45' } })

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

      expect(setDailyDay).not.toHaveBeenCalled()
    })
  })

  describe('送信（超過なし）', () => {
    it('確認なしですぐ送る', async () => {
      const { container } = await renderReport()

      fireEvent.click(sendButton(container))

      expect(send).toHaveBeenCalledOnce()
    })

    it('成功したら「送信しました」にする', async () => {
      const { container } = await renderReport()

      fireEvent.click(sendButton(container))

      expect(await screen.findByText('送信しました')).toBeInTheDocument()
    })

    it('未サインインなら「認証が必要です」にする', async () => {
      send.mockResolvedValue({ ok: false, status: 0, body: '' })
      const { container } = await renderReport()

      fireEvent.click(sendButton(container))

      expect(await screen.findByText('認証が必要です')).toBeInTheDocument()
    })

    it('出勤・退勤が揃っていなければ押せない', async () => {
      const { container } = await renderReport([task()], { workStart: '09:00' })

      expect(sendButton(container)).toBeDisabled()
    })
  })

  describe('送信（タイマー合計が実労働を超える）', () => {
    // 実労働 480分に対しタイマー合計 510分 → 超過30分で末尾タスクが 0 分になる
    const withZeroTask = [task({ id: '1', taskId: '1', name: '設計', totalTime: 480 }), task({ id: '2', taskId: '2', name: 'レビュー', totalTime: 30 })]
    // タイマー合計 500分 → 超過20分。0 分になるタスクは無い
    const withoutZeroTask = [task({ totalTime: 500 })]
    const CONFIRM = '超過分を調整して送信します。よろしいですか？'

    it('送るボタンを「調整して送る」にする', async () => {
      await renderReport(withZeroTask)

      expect(screen.getByText('調整して送る')).toBeInTheDocument()
    })

    it.each([
      ['0分のタスクがある', withZeroTask],
      ['0分のタスクが無い', withoutZeroTask],
    ])('%s 場合も、送る前に確認を出す', async (_label, sessions) => {
      const { container } = await renderReport(sessions)

      fireEvent.click(sendButton(container))

      expect(await screen.findByText(CONFIRM)).toBeInTheDocument()
    })

    it('確認の時点ではまだ送らない', async () => {
      const { container } = await renderReport(withZeroTask)

      fireEvent.click(sendButton(container))

      expect(send).not.toHaveBeenCalled()
    })

    it('0分のタスクがあれば確認でそれを知らせる', async () => {
      const { container } = await renderReport(withZeroTask)

      fireEvent.click(sendButton(container))

      expect(await screen.findByText(/0分になるタスクがあります/)).toBeInTheDocument()
    })

    it('0分のタスクが無ければ、その知らせは出さない', async () => {
      const { container } = await renderReport(withoutZeroTask)
      fireEvent.click(sendButton(container))
      await screen.findByText(CONFIRM)

      expect(screen.queryByText(/0分になるタスクがあります/)).not.toBeInTheDocument()
    })

    it('確認で「送信」を押すと送る', async () => {
      const { container } = await renderReport(withZeroTask)
      fireEvent.click(sendButton(container))

      fireEvent.click(await screen.findByRole('button', { name: '送信' }))

      expect(send).toHaveBeenCalledOnce()
    })

    it('確認でキャンセルすると送らない', async () => {
      const { container } = await renderReport(withZeroTask)
      fireEvent.click(sendButton(container))

      fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))

      expect(send).not.toHaveBeenCalled()
    })

    it('送信に失敗したら「送信失敗」にする', async () => {
      send.mockResolvedValue({ ok: false, status: 500, body: '' })
      const { container } = await renderReport(withZeroTask)
      fireEvent.click(sendButton(container))

      fireEvent.click(await screen.findByRole('button', { name: '送信' }))

      expect(await screen.findByText('送信失敗')).toBeInTheDocument()
    })
  })
})
