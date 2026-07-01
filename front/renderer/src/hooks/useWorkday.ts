import { useEffect, useCallback } from 'react'
import { useDailyData } from '../daily/DailyDataContext'
import { attendanceRepository } from '../repositories/attendanceRepository'
import type { WorkLocation } from '../types/session'

export interface WorkdayState {
  workStart: string | null
  workEnd: string | null
  breakStart: string | null
  breakEnd: string | null
  telework: boolean
  /** 今の勤務場所（新規セッションに付与される） */
  currentLocation: WorkLocation
  /** 業務開始時刻と在宅フラグを保存する */
  startWork: (time: string, telework: boolean) => void
  /** 業務終了時刻を保存する */
  endWork: (time: string) => void
  startBreak: (time: string) => void
  endBreak: (time: string) => void
  setBreakMinutes: (minutes: number) => void
  /** 勤務場所を切り替える。telework になる時のみ whiteboard を更新する */
  switchLocation: (loc: WorkLocation) => void
}

/** 日付（todayKey）ごとの勤怠時刻を日次ストアと同期する。 */
export function useWorkday(todayKey: string): WorkdayState {
  const daily = useDailyData()

  useEffect(() => {
    daily.ensureMonth(todayKey.slice(0, 7))
  }, [todayKey, daily])

  const day = daily.getDay(todayKey)
  const workStart = day?.workStart ?? null
  const workEnd = day?.workEnd ?? null
  const breakStart = day?.breakStart ?? null
  const breakEnd = day?.breakEnd ?? null
  const telework = day?.telework ?? false
  const currentLocation: WorkLocation = day?.currentLocation ?? (telework ? 'telework' : 'office')

  const startWork = useCallback((time: string, tw: boolean): void => {
    void daily.setDay(todayKey, { workStart: time, telework: tw, currentLocation: tw ? 'telework' : 'office' })
  }, [todayKey, daily])

  const endWork = useCallback((time: string): void => {
    void daily.setDay(todayKey, { workEnd: time })
  }, [todayKey, daily])

  const startBreak = useCallback((time: string): void => {
    void daily.setDay(todayKey, { breakStart: time, breakEnd: null })
  }, [todayKey, daily])

  const endBreak = useCallback((time: string): void => {
    void daily.setDay(todayKey, { breakEnd: time })
  }, [todayKey, daily])

  const setBreakMinutes = useCallback((minutes: number): void => {
    void daily.setDay(todayKey, { breakMinutes: minutes })
  }, [todayKey, daily])

  const switchLocation = useCallback((loc: WorkLocation): void => {
    void daily.setDay(todayKey, { currentLocation: loc })
    if (loc === 'telework') void attendanceRepository.startTelework()
  }, [todayKey, daily])

  return { workStart, workEnd, breakStart, breakEnd, telework, currentLocation, startWork, endWork, startBreak, endBreak, setBreakMinutes, switchLocation }
}
