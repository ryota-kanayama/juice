import { useState, useEffect, useCallback } from 'react'
import type { Session } from '../types/session'
import { sessionRepository } from '../repositories/sessionRepository'
import { holidayRepository } from '../repositories/holidayRepository'

export interface CalendarState {
  year: number
  month: number
  selectedDate: string | null
  holidays: Record<string, string>
  sessionDates: string[]
  selectedSessions: Session[]
  selectDate: (date: string | null) => void
  prevMonth: () => void
  nextMonth: () => void
  updateSession: (session: Session) => Promise<void>
}

/** カレンダー画面のオーケストレーション。月送り・祝日取得・日別セッション取得を統括。 */
export function useCalendar(): CalendarState {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session[]>>({})
  const [holidays, setHolidays] = useState<Record<string, string>>({})

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  useEffect(() => {
    holidayRepository.getAll().then(setHolidays)
  }, [])

  useEffect(() => {
    sessionRepository.list(yearMonth).then(sessions => {
      const grouped: Record<string, Session[]> = {}
      for (const s of sessions) {
        if (!grouped[s.date]) grouped[s.date] = []
        grouped[s.date].push(s)
      }
      setSessionsByDate(grouped)
    })
  }, [yearMonth])

  const prevMonth = useCallback((): void => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }, [month])

  const nextMonth = useCallback((): void => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }, [month])

  const updateSession = useCallback(async (updated: Session): Promise<void> => {
    await sessionRepository.update(updated)
    setSessionsByDate(prev => ({
      ...prev,
      [updated.date]: prev[updated.date]?.map(s => s.id === updated.id ? updated : s) ?? prev[updated.date],
    }))
  }, [])

  const sessionDates = Object.keys(sessionsByDate)
  const selectedSessions = selectedDate ? (sessionsByDate[selectedDate] ?? []) : []

  return {
    year, month, selectedDate, holidays, sessionDates, selectedSessions,
    selectDate: setSelectedDate, prevMonth, nextMonth, updateSession,
  }
}
