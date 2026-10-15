import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { getWeekdays, calcActualMinutes, buildDayAnalysis, useWeeklyAnalysis } from './useWeeklyAnalysis'
import { DailyDataProvider } from '../daily/DailyDataContext'
import type { Session } from '../types/session'
import type { DayRecord } from '../../../shared/types'
import { makeSession } from '../test/factories'

const getSessions = vi.fn()
const getMainProjectCode = vi.fn()
const getDailyMonth = vi.fn()
vi.stubGlobal('bridge', {
  getSessions,
  getMainProjectCode,
  getDailyMonth,
  setDailyDay: vi.fn(),
  onDailyChanged: () => () => {},
})

describe('getWeekdays', () => {
  it.each([
    ['月曜日', '2026-06-22', ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26']],
    ['水曜日', '2026-06-24', ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26']],
    ['土曜日', '2026-06-27', ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26']],
    ['日曜日（その前の月曜から）', '2026-06-28', ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26']],
    ['月末をまたぐ週', '2026-06-30', ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03']],
  ])('%s を含む週の月〜金を返す', (_label, date, expected) => {
    const days = getWeekdays(date)

    expect(days).toEqual(expected)
  })
})

describe('calcActualMinutes', () => {
  it('出勤〜退勤から保存済みの休憩分を引く', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }

    const minutes = calcActualMinutes(record)

    expect(minutes).toBe(480)
  })

  it('休憩分が無く休憩の開始・終了があれば、そこから休憩を計算する', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00', breakStart: '12:00', breakEnd: '12:45' }

    const minutes = calcActualMinutes(record)

    expect(minutes).toBe(495)
  })

  it('休憩の情報が何も無ければ休憩 0 分', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '18:00' }

    const minutes = calcActualMinutes(record)

    expect(minutes).toBe(540)
  })

  it('休憩が勤務時間より長くても 0 未満にしない', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '09:30', breakMinutes: 60 }

    const minutes = calcActualMinutes(record)

    expect(minutes).toBe(0)
  })

  it.each([
    ['出勤が無い', { workEnd: '18:00' }],
    ['退勤が無い', { workStart: '09:00' }],
    ['記録が無い', null],
  ])('%s なら null', (_label, record) => {
    const minutes = calcActualMinutes(record)

    expect(minutes).toBeNull()
  })
})

describe('buildDayAnalysis', () => {
  const TODAY = '2026-06-28'
  const fullDay: DayRecord = { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }
  const sessions: Session[] = [
    makeSession({ id: '1', projectCode: 'MAIN', workCategory: '開発', totalTime: 300 }),
    makeSession({ id: '2', projectCode: 'OTHER', workCategory: '会議', totalTime: 90 }),
    makeSession({ id: '3', projectCode: 'MAIN', workCategory: '想定外', totalTime: 30 }),
  ]

  it('所定時間は 480 分', () => {
    const result = buildDayAnalysis('2026-06-23', '火', fullDay, sessions, 'MAIN', TODAY)

    expect(result.scheduledMinutes).toBe(480)
  })

  it('実稼働は勤務記録から計算する', () => {
    const result = buildDayAnalysis('2026-06-23', '火', fullDay, sessions, 'MAIN', TODAY)

    expect(result.actualMinutes).toBe(480)
  })

  it('メインPJ以外のセッションの合計を nonProjectMinutes にする', () => {
    const result = buildDayAnalysis('2026-06-23', '火', fullDay, sessions, 'MAIN', TODAY)

    expect(result.nonProjectMinutes).toBe(90)
  })

  it('メインPJが未設定なら nonProjectMinutes は 0', () => {
    const result = buildDayAnalysis('2026-06-23', '火', fullDay, sessions, '', TODAY)

    expect(result.nonProjectMinutes).toBe(0)
  })

  it('作業区分が「想定外」のセッションの合計を unexpectedMinutes にする', () => {
    const result = buildDayAnalysis('2026-06-23', '火', fullDay, sessions, 'MAIN', TODAY)

    expect(result.unexpectedMinutes).toBe(30)
  })

  it('稼働率は実稼働 / 480 を百分率に四捨五入する', () => {
    const record: DayRecord = { workStart: '09:00', workEnd: '13:00', breakMinutes: 0 } // 240分 → 50%

    const result = buildDayAnalysis('2026-06-23', '火', record, [], 'MAIN', TODAY)

    expect(result.utilizationRate).toBe(50)
  })

  it('勤務記録が無ければ稼働率は null', () => {
    const result = buildDayAnalysis('2026-06-23', '火', null, sessions, 'MAIN', TODAY)

    expect(result.utilizationRate).toBeNull()
  })

  it.each([
    ['今日より前で勤務記録が無い日は休み扱い', '2026-06-23', null, true],
    ['今日より前でも勤務記録があれば休みではない', '2026-06-23', fullDay, false],
    ['今日は勤務記録が無くても未確定なので休みではない', TODAY, null, false],
    ['未来の日は休みではない', '2026-07-01', null, false],
  ])('%s', (_label, date, record, expected) => {
    const result = buildDayAnalysis(date, '火', record, sessions, 'MAIN', TODAY)

    expect(result.isOff).toBe(expected)
  })
})

describe('useWeeklyAnalysis', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <DailyDataProvider>{children}</DailyDataProvider>

  async function renderAnalysis(date: string | null) {
    const hook = renderHook(() => useWeeklyAnalysis(date), { wrapper })
    await act(async () => {})
    return hook.result
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 28, 12, 0, 0)) // 2026-06-28（日）
    getSessions.mockReset().mockResolvedValue([])
    getMainProjectCode.mockReset().mockResolvedValue('MAIN')
    getDailyMonth.mockReset().mockResolvedValue({ version: 1, days: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('日付が null なら分析しない', async () => {
    const result = await renderAnalysis(null)

    expect(result.current.analysis).toBeNull()
  })

  it('週の見出しは月曜日の日付', async () => {
    const result = await renderAnalysis('2026-06-24')

    expect(result.current.analysis?.weekLabel).toBe('2026/06/22 の週')
  })

  it('月〜金の5日分を、曜日の見出し付きで返す', async () => {
    const result = await renderAnalysis('2026-06-24')

    expect(result.current.analysis?.days.map(d => [d.date, d.dayLabel])).toEqual([
      ['2026-06-22', '月'], ['2026-06-23', '火'], ['2026-06-24', '水'], ['2026-06-25', '木'], ['2026-06-26', '金'],
    ])
  })

  it('その日のセッションだけで各日の指標を計算する', async () => {
    getSessions.mockResolvedValue([
      makeSession({ id: 'a', date: '2026-06-23', projectCode: 'OTHER', totalTime: 90 }),
      makeSession({ id: 'b', date: '2026-06-24', projectCode: 'OTHER', totalTime: 30 }),
    ])

    const result = await renderAnalysis('2026-06-24')

    expect(result.current.analysis?.days.map(d => d.nonProjectMinutes)).toEqual([0, 90, 30, 0, 0])
  })

  // 既知の不具合（#158 / #126）: 分析は初回描画時の daily（まだ空）で計算され、
  // 勤務記録の読み込みが後から終わっても再計算されない。直ったら it.fails を外す
  it.fails('週平均の稼働率は、勤務記録のある日だけで平均する', async () => {
    getDailyMonth.mockResolvedValue({
      version: 1,
      days: {
        '2026-06-22': { workStart: '09:00', workEnd: '18:00', breakMinutes: 60 }, // 100%
        '2026-06-23': { workStart: '09:00', workEnd: '13:00', breakMinutes: 0 }, // 50%
      },
    })

    const result = await renderAnalysis('2026-06-24')

    expect(result.current.analysis?.weeklyAvgUtilization).toBe(75)
  })

  it('勤務記録が1日も無ければ週平均は null', async () => {
    const result = await renderAnalysis('2026-06-24')

    expect(result.current.analysis?.weeklyAvgUtilization).toBeNull()
  })

  it('月をまたぐ週は両方の月のセッションを読む', async () => {
    await renderAnalysis('2026-06-30')

    expect(getSessions.mock.calls.map(c => c[0]).sort()).toEqual(['2026-06', '2026-07'])
  })

  it('読み込みが終わったら loading を下ろす', async () => {
    const result = await renderAnalysis('2026-06-24')

    expect(result.current.loading).toBe(false)
  })
})
