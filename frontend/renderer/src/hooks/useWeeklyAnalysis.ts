import { useState, useEffect } from 'react'
import type { Session } from '../types/session'
import type { DayRecord } from '../../../shared/types'
import { sessionRepository } from '../repositories/sessionRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { useDailyData } from '../daily/DailyDataContext'
import { calcBreakMinutes } from '../domain/attendance'

export interface DayAnalysis {
  date: string
  dayLabel: string
  scheduledMinutes: number
  actualMinutes: number | null
  nonProjectMinutes: number
  unexpectedMinutes: number
  utilizationRate: number | null
  /** 今日より前で勤怠未入力の日（集計対象外＝「休」扱い） */
  isOff: boolean
}

export interface WeeklyAnalysis {
  weekLabel: string
  days: DayAnalysis[]
  weeklyAvgUtilization: number | null
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/** date を含む週の月〜金の "YYYY-MM-DD" 配列を返す（月曜始まり） */
export function getWeekdays(date: string): string[] {
  const d = new Date(`${date}T00:00:00`)
  const dow = d.getDay()  // 0=日, 1=月, ...6=土
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)
  return Array.from({ length: 5 }, (_, i) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    const y = day.getFullYear()
    const m = String(day.getMonth() + 1).padStart(2, '0')
    const dd = String(day.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  })
}

/** DayRecord から実稼働時間（分）を算出。workStart/workEnd 未入力なら null */
export function calcActualMinutes(record: DayRecord | null): number | null {
  if (!record?.workStart || !record?.workEnd) return null
  const parseHHMM = (t: string): number => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const totalMins = parseHHMM(record.workEnd) - parseHHMM(record.workStart)
  const breakMins = record.breakMinutes != null
    ? record.breakMinutes
    : (record.breakStart && record.breakEnd)
      ? calcBreakMinutes(record.breakStart, record.breakEnd)
      : 0
  return Math.max(0, totalMins - breakMins)
}

/** 1日分の分析データを計算する */
export function buildDayAnalysis(
  date: string,
  dayLabel: string,
  record: DayRecord | null,
  sessions: Session[],
  mainProjectCode: string,
  today: string,
): DayAnalysis {
  const actualMinutes = calcActualMinutes(record)
  const nonProjectMinutes = mainProjectCode
    ? sessions.filter(s => s.projectCode !== mainProjectCode).reduce((acc, s) => acc + s.totalTime, 0)
    : 0
  const unexpectedMinutes = sessions
    .filter(s => s.workCategory === '想定外')
    .reduce((acc, s) => acc + s.totalTime, 0)
  const utilizationRate = actualMinutes !== null
    ? Math.round(actualMinutes / 480 * 100)
    : null
  const isOff = actualMinutes === null && date < today
  return { date, dayLabel, scheduledMinutes: 480, actualMinutes, nonProjectMinutes, unexpectedMinutes, utilizationRate, isOff }
}

/** 選択日を含む週の稼働分析データを返すフック */
export function useWeeklyAnalysis(date: string | null): { analysis: WeeklyAnalysis | null; loading: boolean } {
  const [analysis, setAnalysis] = useState<WeeklyAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const daily = useDailyData()

  useEffect(() => {
    if (!date) { setAnalysis(null); return }

    const weekdays = getWeekdays(date)
    // 月またぎ対応：必要な月を重複なく収集
    const months = [...new Set(weekdays.map(d => d.slice(0, 7)))]
    months.forEach(ym => daily.ensureMonth(ym))

    setLoading(true)
    Promise.all([
      ...months.map(ym => sessionRepository.list(ym)),
      settingsRepository.getMainProjectCode(),
    ]).then(results => {
      const allSessions = (results.slice(0, months.length) as Session[][]).flat()
      const mainProjectCode = results[months.length] as string

      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      const days = weekdays.map(d => {
        const dow = new Date(`${d}T00:00:00`).getDay()
        const dayLabel = DAY_LABELS[dow]
        const record = daily.getDay(d)
        const daySessions = allSessions.filter(s => s.date === d)
        return buildDayAnalysis(d, dayLabel, record, daySessions, mainProjectCode, today)
      })

      const validRates = days.map(d => d.utilizationRate).filter((r): r is number => r !== null)
      const weeklyAvgUtilization = validRates.length > 0
        ? Math.round(validRates.reduce((a, b) => a + b, 0) / validRates.length)
        : null

      const monday = weekdays[0]
      const weekLabel = `${monday.slice(0, 4)}/${monday.slice(5, 7)}/${monday.slice(8, 10)} の週`

      setAnalysis({ weekLabel, days, weeklyAvgUtilization })
    }).finally(() => setLoading(false))
    // daily は context 由来で毎レンダー identity が変わり得るため deps に含めない
    // （含めると再実行ループの恐れ）。週(date)変更時のみ再計算する意図。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  return { analysis, loading }
}
