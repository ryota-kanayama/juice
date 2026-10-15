// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DailyDataProvider } from '../daily/DailyDataContext'
import { useAttendanceReport, type AttendanceReportState } from './useAttendanceReport'
import type { Session } from '../types/session'
import type { DayRecord } from '../../../shared/types'
import { interval, makeSession } from '../test/factories'

const TODAY = '2026-06-12'

const send = vi.fn()
vi.mock('../repositories/attendanceRepository', () => ({
  attendanceRepository: { send: (...args: unknown[]) => send(...args) },
}))

const getDailyMonth = vi.fn()
const setDailyDay = vi.fn()
vi.stubGlobal('bridge', {
  getDailyMonth,
  setDailyDay,
  onDailyChanged: () => () => {},
})

const writeText = vi.fn()

const wrapper = ({ children }: { children: ReactNode }) => <DailyDataProvider>{children}</DailyDataProvider>

const task = (overrides: Partial<Session> = {}): Session => makeSession({
  name: '作業',
  projectCode: 'P',
  workCategory: 'C',
  date: TODAY,
  times: [interval(`${TODAY}T10:00:00`, `${TODAY}T11:00:00`)],
  totalTime: 60,
  ...overrides,
})

type Hook = RenderHookResult<AttendanceReportState, unknown>['result']

/** 今日の勤務記録を用意して描画し、読み込みを待つ */
async function renderReport(day: DayRecord = {}, sessions: Session[] = [task()]): Promise<Hook> {
  getDailyMonth.mockResolvedValue({ version: 1, days: { [TODAY]: day } })
  const { result } = renderHook(() => useAttendanceReport(sessions, TODAY), { wrapper })
  await act(async () => {})
  return result
}

async function sendReport(hook: Hook): Promise<void> {
  await act(async () => { await hook.current.send() })
}

beforeEach(() => {
  send.mockReset()
  getDailyMonth.mockReset()
  setDailyDay.mockReset().mockResolvedValue(undefined)
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAttendanceReport', () => {
  describe('勤怠テキスト', () => {
    it('今日の出勤・退勤・休憩とセッションから組み立てる', async () => {
      const hook = await renderReport({ workStart: '10:00', workEnd: '11:00', breakMinutes: 0 })

      expect(hook.current.text).toBe('勤怠\n10:00 11:00 0\nP 作業 C 60')
    })

    it('並び順が保存されていればその順に並べる', async () => {
      const sessions = [task({ id: 'a', taskId: 'a', name: 'A' }), task({ id: 'b', taskId: 'b', name: 'B' })]

      const hook = await renderReport({ workStart: '10:00', workEnd: '12:00', breakMinutes: 0, sessionOrder: ['b', 'a'] }, sessions)

      expect(hook.current.text.split('\n').slice(2)).toEqual(['P B C 60', 'P A C 60'])
    })

    it('タイマー合計が実労働を超えた分を overageMinutes で返す', async () => {
      const hook = await renderReport({ workStart: '10:00', workEnd: '10:40', breakMinutes: 0 })

      expect(hook.current.overageMinutes).toBe(20)
    })
  })

  describe('休憩時間', () => {
    it('保存済みの休憩分があればそれを使う', async () => {
      const hook = await renderReport({ breakMinutes: 45, breakStart: '12:00', breakEnd: '13:00' })

      expect(hook.current.breakMinutes).toBe(45)
    })

    it('保存済みの休憩分が無ければ休憩の開始・終了から計算する', async () => {
      const hook = await renderReport({ breakStart: '12:00', breakEnd: '12:30' })

      expect(hook.current.breakMinutes).toBe(30)
    })

    it('どちらも無ければ 60 分', async () => {
      const hook = await renderReport({})

      expect(hook.current.breakMinutes).toBe(60)
    })
  })

  describe('setter', () => {
    it.each([
      ['setWorkStart', (h: AttendanceReportState) => h.setWorkStart('09:00'), { workStart: '09:00' }],
      ['setWorkEnd', (h: AttendanceReportState) => h.setWorkEnd('18:00'), { workEnd: '18:00' }],
      ['setBreakMinutes', (h: AttendanceReportState) => h.setBreakMinutes(30), { breakMinutes: 30 }],
    ] as const)('%s は今日の勤務記録に保存する', async (_name, call, patch) => {
      const hook = await renderReport()

      await act(async () => { call(hook.current) })

      expect(setDailyDay).toHaveBeenCalledWith(TODAY, patch)
    })
  })

  describe('canSend', () => {
    it('出勤・退勤が揃い、セッションがあれば送信できる', async () => {
      const hook = await renderReport({ workStart: '09:00', workEnd: '18:00' })

      expect(hook.current.canSend).toBe(true)
    })

    it.each([
      ['出勤が無い', { workEnd: '18:00' }],
      ['退勤が無い', { workStart: '09:00' }],
    ])('%s と送信できない', async (_label, day) => {
      const hook = await renderReport(day)

      expect(hook.current.canSend).toBe(false)
    })

    it('セッションが無いと送信できない', async () => {
      const hook = await renderReport({ workStart: '09:00', workEnd: '18:00' }, [])

      expect(hook.current.canSend).toBe(false)
    })
  })

  describe('send', () => {
    it('勤怠テキストを送る', async () => {
      send.mockResolvedValue({ ok: true, status: 200, body: '{}' })
      const hook = await renderReport({ workStart: '10:00', workEnd: '11:00', breakMinutes: 0 })

      await sendReport(hook)

      expect(send).toHaveBeenCalledWith('勤怠\n10:00 11:00 0\nP 作業 C 60')
    })

    it.each([
      ['成功', { ok: true, status: 200, body: '{}' }, 'success'],
      ['未サインイン（status 0）', { ok: false, status: 0, body: 'サインインが必要です' }, 'auth'],
      ['セッション切れ（status 401）', { ok: false, status: 401, body: '{"error":"unauthorized"}' }, 'auth'],
      ['入力不備（status 400）', { ok: false, status: 400, body: '{"error_message":"format"}' }, 'error'],
      ['上流エラー（status 502）', { ok: false, status: 502, body: 'attendance api error' }, 'error'],
    ])('%s なら sendResult は %s', async (_label, response, expected) => {
      send.mockResolvedValue(response)
      const hook = await renderReport()

      await sendReport(hook)

      expect(hook.current.sendResult).toBe(expected)
    })

    it('例外なら sendResult は error', async () => {
      send.mockRejectedValue(new Error('boom'))
      const hook = await renderReport()

      await sendReport(hook)

      expect(hook.current.sendResult).toBe('error')
    })

    it('送信中は sending が true', async () => {
      send.mockReturnValue(new Promise(() => {}))
      const hook = await renderReport()

      act(() => { void hook.current.send() })

      expect(hook.current.sending).toBe(true)
    })

    it('終わったら sending を下ろす', async () => {
      send.mockRejectedValue(new Error('boom'))
      const hook = await renderReport()

      await sendReport(hook)

      expect(hook.current.sending).toBe(false)
    })

    it('送信結果は3秒後に消える', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      send.mockResolvedValue({ ok: true, status: 200, body: '{}' })
      const hook = await renderReport()
      await sendReport(hook)

      act(() => { vi.advanceTimersByTime(3000) })

      expect(hook.current.sendResult).toBeNull()
    })
  })

  describe('copy', () => {
    it('勤怠テキストをクリップボードへ書き込む', async () => {
      const hook = await renderReport({ workStart: '10:00', workEnd: '11:00', breakMinutes: 0 })

      await act(async () => { hook.current.copy() })

      expect(writeText).toHaveBeenCalledWith('勤怠\n10:00 11:00 0\nP 作業 C 60')
    })

    it('書き込めたら copied を立てる', async () => {
      const hook = await renderReport()

      await act(async () => { hook.current.copy() })

      expect(hook.current.copied).toBe(true)
    })

    it('copied は2秒後に下りる', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      const hook = await renderReport()
      await act(async () => { hook.current.copy() })

      act(() => { vi.advanceTimersByTime(2000) })

      expect(hook.current.copied).toBe(false)
    })

    it('書き込みに失敗したら copied を立てない', async () => {
      writeText.mockRejectedValue(new Error('denied'))
      const hook = await renderReport()

      await act(async () => { hook.current.copy() })

      expect(hook.current.copied).toBe(false)
    })
  })
})
