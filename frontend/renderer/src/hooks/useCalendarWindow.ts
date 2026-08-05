import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Session } from '../types/session'
import { sessionRepository } from '../repositories/sessionRepository'
import { holidayRepository } from '../repositories/holidayRepository'
import { addDays, weekDates } from '../domain/calendarRange'

export type CalendarView = 'week' | 'month'

export interface CalendarWindowState {
  view: CalendarView
  setView: (v: CalendarView) => void
  /** 表示の基準日 "YYYY-MM-DD"。週表示ならこの日を含む週、月表示ならこの日の月を表示する */
  anchorDate: string
  /** 詳細ペインに出す選択日 "YYYY-MM-DD" */
  selectedDate: string
  selectDate: (date: string) => void
  goToday: () => void
  /** ビューに応じて1つ前へ（週表示=7日前 / 月表示=前月） */
  goPrev: () => void
  /** ビューに応じて1つ次へ（週表示=7日後 / 月表示=翌月） */
  goNext: () => void
  /** ビューに関わらず前月へ（ミニカレンダーの月送り用） */
  goPrevMonth: () => void
  /** ビューに関わらず翌月へ（ミニカレンダーの月送り用） */
  goNextMonth: () => void
  /** 現在の表示範囲の日付一覧（週=7日 / 月=その月の1日〜末日） */
  visibleDates: string[]
  /** 日付 → その日のセッション一覧 */
  sessionsByDate: Record<string, Session[]>
  holidays: Record<string, string>
  updateSession: (session: Session) => Promise<void>
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** その月の1日〜末日を "YYYY-MM-DD" で列挙する。 */
function monthDates(date: string): string[] {
  const [y, m] = date.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return Array.from({ length: last }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`)
}

/** カレンダー窓の表示状態とデータ取得を統括する。 */
export function useCalendarWindow(): CalendarWindowState {
  const [view, setView] = useState<CalendarView>('week')
  const [anchorDate, setAnchorDate] = useState(todayStr)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session[]>>({})
  const [holidays, setHolidays] = useState<Record<string, string>>({})

  const visibleDates = useMemo(
    () => (view === 'week' ? weekDates(anchorDate) : monthDates(anchorDate)),
    [view, anchorDate],
  )

  // 表示範囲がまたぐ年月をすべて読み込む（週が月をまたぐケースに対応）
  const yearMonths = useMemo(() => {
    const set = new Set(visibleDates.map(d => d.slice(0, 7)))
    return Array.from(set).sort()
  }, [visibleDates])
  const yearMonthsKey = yearMonths.join(',')

  useEffect(() => {
    holidayRepository.getAll().then(setHolidays)
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all(yearMonths.map(ym => sessionRepository.list(ym))).then(results => {
      if (!alive) return
      const grouped: Record<string, Session[]> = {}
      for (const s of results.flat()) {
        if (!grouped[s.date]) grouped[s.date] = []
        grouped[s.date].push(s)
      }
      setSessionsByDate(grouped)
    })
    return () => { alive = false }
    // yearMonths は毎回新しい配列になるため、内容を表す key で依存を張る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonthsKey])

  const goToday = useCallback((): void => {
    const t = todayStr()
    setAnchorDate(t)
    setSelectedDate(t)
  }, [])

  /** 基準日を offset ヶ月ずらし、その月の1日を返す。 */
  const shiftMonth = useCallback((offset: number): void => {
    setAnchorDate(prev => {
      const [y, m] = prev.split('-').map(Number)
      const d = new Date(y, m - 1 + offset, 1)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
    })
  }, [])

  const goPrevMonth = useCallback((): void => { shiftMonth(-1) }, [shiftMonth])
  const goNextMonth = useCallback((): void => { shiftMonth(1) }, [shiftMonth])

  const goPrev = useCallback((): void => {
    if (view === 'month') { shiftMonth(-1); return }
    setAnchorDate(prev => addDays(prev, -7))
  }, [view, shiftMonth])

  const goNext = useCallback((): void => {
    if (view === 'month') { shiftMonth(1); return }
    setAnchorDate(prev => addDays(prev, 7))
  }, [view, shiftMonth])

  const updateSession = useCallback(async (updated: Session): Promise<void> => {
    await sessionRepository.update(updated)
    setSessionsByDate(prev => ({
      ...prev,
      [updated.date]: prev[updated.date]?.map(s => (s.id === updated.id ? updated : s)) ?? prev[updated.date],
    }))
  }, [])

  return {
    view, setView, anchorDate, selectedDate, selectDate: setSelectedDate,
    goToday, goPrev, goNext, goPrevMonth, goNextMonth,
    visibleDates, sessionsByDate, holidays, updateSession,
  }
}
