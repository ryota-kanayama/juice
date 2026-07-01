import { describe, it, expect } from 'vitest'
import { getWeekdays, calcActualMinutes, buildDayAnalysis } from './useWeeklyAnalysis'
import type { Session } from '../types/session'
import type { DayRecord } from '../../../shared/types'

describe('getWeekdays', () => {
  it('月曜日を含む日付の週の月〜金を返す', () => {
    const days = getWeekdays('2026-06-22')  // 月曜
    expect(days).toEqual(['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'])
  })

  it('水曜日を含む日付の週の月〜金を返す', () => {
    const days = getWeekdays('2026-06-24')  // 水曜
    expect(days).toEqual(['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'])
  })

  it('日曜日を含む日付の週の月〜金を返す（前週）', () => {
    const days = getWeekdays('2026-06-28')  // 日曜
    expect(days).toEqual(['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'])
  })

  it('月末をまたぐ週を正しく返す', () => {
    const days = getWeekdays('2026-06-30')  // 火曜
    expect(days).toEqual(['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03'])
  })
})

describe('calcActualMinutes', () => {
  it('workStart と workEnd から breakMinutes を引いた分数を返す', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }
    expect(calcActualMinutes(record)).toBe(480)
  })

  it('breakMinutes が未設定で breakStart/breakEnd がある場合は自動計算する', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00', breakStart: '12:00', breakEnd: '13:00' }
    expect(calcActualMinutes(record)).toBe(480)
  })

  it('workStart が未入力の場合は null を返す', () => {
    expect(calcActualMinutes({ workEnd: '18:00' })).toBeNull()
  })

  it('workEnd が未入力の場合は null を返す', () => {
    expect(calcActualMinutes({ workStart: '09:00' })).toBeNull()
  })

  it('record が null の場合は null を返す', () => {
    expect(calcActualMinutes(null)).toBeNull()
  })

  it('breakMinutes も breakStart/breakEnd も未設定の場合は休憩 0 分として計算する', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00' }
    expect(calcActualMinutes(record)).toBe(540)
  })
})

describe('buildDayAnalysis', () => {
  const sessions: Session[] = [
    {
      id: '1', taskId: '1', name: '主PJ作業', projectCode: 'MAIN', workCategory: '開発',
      times: [], date: '2026-06-23', color: '#FF9500', totalTime: 300,
    },
    {
      id: '2', taskId: '2', name: 'PJ外作業', projectCode: 'OTHER', workCategory: '会議',
      times: [], date: '2026-06-23', color: '#FF9500', totalTime: 90,
    },
    {
      id: '3', taskId: '3', name: '想定外作業', projectCode: 'MAIN', workCategory: '想定外',
      times: [], date: '2026-06-23', color: '#FF9500', totalTime: 30,
    },
  ]

  const TODAY = '2026-06-28'

  it('各指標を正しく計算する', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }
    const result = buildDayAnalysis('2026-06-23', '火', record, sessions, 'MAIN', TODAY)
    expect(result.scheduledMinutes).toBe(480)
    expect(result.actualMinutes).toBe(480)
    expect(result.nonProjectMinutes).toBe(90)   // projectCode !== 'MAIN'
    expect(result.unexpectedMinutes).toBe(30)    // workCategory === '想定外'
    expect(result.utilizationRate).toBe(100)     // 480/480*100
  })

  it('mainProjectCode が空のとき nonProjectMinutes は 0', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }
    const result = buildDayAnalysis('2026-06-23', '火', record, sessions, '', TODAY)
    expect(result.nonProjectMinutes).toBe(0)
  })

  it('actualMinutes が null のとき utilizationRate も null', () => {
    const result = buildDayAnalysis('2026-06-23', '火', null, sessions, 'MAIN', TODAY)
    expect(result.actualMinutes).toBeNull()
    expect(result.utilizationRate).toBeNull()
  })

  it('今日より前で勤怠未入力なら isOff は true（休扱い）', () => {
    const result = buildDayAnalysis('2026-06-23', '火', null, sessions, 'MAIN', TODAY)
    expect(result.isOff).toBe(true)
  })

  it('今日より前でも勤怠入力があれば isOff は false', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }
    const result = buildDayAnalysis('2026-06-23', '火', record, sessions, 'MAIN', TODAY)
    expect(result.isOff).toBe(false)
  })

  it('今日の未入力日は isOff false（未確定なので 480 のまま）', () => {
    const result = buildDayAnalysis(TODAY, '日', null, sessions, 'MAIN', TODAY)
    expect(result.isOff).toBe(false)
  })

  it('未来の未入力日は isOff false', () => {
    const result = buildDayAnalysis('2026-07-01', '水', null, sessions, 'MAIN', TODAY)
    expect(result.isOff).toBe(false)
  })
})
