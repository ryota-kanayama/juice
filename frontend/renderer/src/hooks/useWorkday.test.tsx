import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DailyDataProvider } from '../daily/DailyDataContext'
import { useWorkday, type WorkdayState } from './useWorkday'
import type { DayRecord } from '../../../shared/types'

const TODAY = '2026-06-10'

const getDailyMonth = vi.fn()
const setDailyDay = vi.fn()
vi.stubGlobal('bridge', {
  getDailyMonth,
  setDailyDay,
  onDailyChanged: () => () => {},
})

const startTelework = vi.hoisted(() => vi.fn())
vi.mock('../repositories/attendanceRepository', () => ({
  attendanceRepository: { startTelework: () => startTelework() },
}))

const wrapper = ({ children }: { children: ReactNode }) => <DailyDataProvider>{children}</DailyDataProvider>

type Hook = RenderHookResult<WorkdayState, unknown>['result']

/** 今日の勤務記録を用意して描画し、読み込みを待つ */
async function renderWorkday(day?: DayRecord): Promise<Hook> {
  getDailyMonth.mockResolvedValue({ version: 1, days: day ? { [TODAY]: day } : {} })
  const { result } = renderHook(() => useWorkday(TODAY), { wrapper })
  await act(async () => {})
  return result
}

beforeEach(() => {
  getDailyMonth.mockReset()
  setDailyDay.mockReset().mockResolvedValue(undefined)
  startTelework.mockReset().mockResolvedValue(undefined)
})

describe('useWorkday', () => {
  describe('読み込み', () => {
    it('今日を含む月の勤務記録を読む', async () => {
      await renderWorkday()

      expect(getDailyMonth).toHaveBeenCalledWith('2026-06')
    })

    it('今日の勤務記録の時刻を返す', async () => {
      const result = await renderWorkday({ workStart: '09:00', workEnd: '18:00', breakStart: '12:00', breakEnd: '13:00' })

      expect(result.current).toMatchObject({ workStart: '09:00', workEnd: '18:00', breakStart: '12:00', breakEnd: '13:00' })
    })

    it('記録が無ければ時刻はすべて null で、テレワークではない', async () => {
      const result = await renderWorkday()

      expect(result.current).toMatchObject({ workStart: null, workEnd: null, breakStart: null, breakEnd: null, telework: false })
    })
  })

  describe('currentLocation（今の勤務場所）', () => {
    it('記録された値を返す', async () => {
      const result = await renderWorkday({ currentLocation: 'telework', telework: false })

      expect(result.current.currentLocation).toBe('telework')
    })

    it('未記録なら、業務開始時のテレワーク指定から決める', async () => {
      const result = await renderWorkday({ telework: true })

      expect(result.current.currentLocation).toBe('telework')
    })

    it('どちらも無ければ出社', async () => {
      const result = await renderWorkday()

      expect(result.current.currentLocation).toBe('office')
    })
  })

  describe('startWork', () => {
    it('開始時刻・テレワーク指定・今の勤務場所をまとめて保存する', async () => {
      const result = await renderWorkday()

      await act(async () => { result.current.startWork('09:30', true) })

      expect(setDailyDay).toHaveBeenCalledWith(TODAY, { workStart: '09:30', telework: true, currentLocation: 'telework' })
    })

    it('出社で始めたら今の勤務場所は出社', async () => {
      const result = await renderWorkday()

      await act(async () => { result.current.startWork('09:30', false) })

      expect(setDailyDay).toHaveBeenCalledWith(TODAY, { workStart: '09:30', telework: false, currentLocation: 'office' })
    })

    it('保存を待たずに画面へ反映する', async () => {
      setDailyDay.mockReturnValue(new Promise(() => {}))
      const result = await renderWorkday()

      act(() => { result.current.startWork('09:30', true) })

      expect(result.current).toMatchObject({ workStart: '09:30', telework: true })
    })
  })

  describe('時刻の記録', () => {
    it.each([
      ['endWork', (h: WorkdayState) => h.endWork('18:00'), { workEnd: '18:00' }],
      ['startBreak は前回の休憩終了を消す', (h: WorkdayState) => h.startBreak('12:00'), { breakStart: '12:00', breakEnd: null }],
      ['endBreak', (h: WorkdayState) => h.endBreak('13:00'), { breakEnd: '13:00' }],
      ['setBreakMinutes', (h: WorkdayState) => h.setBreakMinutes(45), { breakMinutes: 45 }],
    ] as const)('%s', async (_label, call, patch) => {
      const result = await renderWorkday({ workStart: '09:00', breakEnd: '11:00' })

      await act(async () => { call(result.current) })

      expect(setDailyDay).toHaveBeenCalledWith(TODAY, patch)
    })
  })

  describe('switchLocation', () => {
    it('今の勤務場所を保存する', async () => {
      const result = await renderWorkday({ workStart: '09:00' })

      await act(async () => { result.current.switchLocation('telework') })

      expect(setDailyDay).toHaveBeenCalledWith(TODAY, { currentLocation: 'telework' })
    })

    it('テレワークに切り替えたらホワイトボードを更新する', async () => {
      const result = await renderWorkday({ workStart: '09:00' })

      await act(async () => { result.current.switchLocation('telework') })

      expect(startTelework).toHaveBeenCalledOnce()
    })

    it('出社に切り替えてもホワイトボードは更新しない', async () => {
      const result = await renderWorkday({ workStart: '09:00', currentLocation: 'telework' })

      await act(async () => { result.current.switchLocation('office') })

      expect(startTelework).not.toHaveBeenCalled()
    })
  })
})
