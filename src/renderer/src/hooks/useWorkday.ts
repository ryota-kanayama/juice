import { useState, useEffect, useCallback } from 'react'
import { dailyStore } from '../dailyStore'

export interface WorkdayState {
  workStart: string | null
  workEnd: string | null
  telework: boolean
  /** 業務開始時刻と在宅フラグを保存する */
  startWork: (time: string, telework: boolean) => void
  /** 業務終了時刻を保存する */
  endWork: (time: string) => void
}

/** 日付（todayKey）ごとの勤怠時刻を localStorage と同期する。日付が変わると再読込する。 */
export function useWorkday(todayKey: string): WorkdayState {
  const [workStart, setWorkStart] = useState<string | null>(() => dailyStore.getWorkStart(todayKey))
  const [workEnd, setWorkEnd] = useState<string | null>(() => dailyStore.getWorkEnd(todayKey))
  const [telework, setTelework] = useState<boolean>(() => dailyStore.getTelework(todayKey))

  useEffect(() => {
    setWorkStart(dailyStore.getWorkStart(todayKey))
    setWorkEnd(dailyStore.getWorkEnd(todayKey))
    setTelework(dailyStore.getTelework(todayKey))
  }, [todayKey])

  const startWork = useCallback((time: string, tw: boolean): void => {
    dailyStore.setWorkStart(todayKey, time)
    dailyStore.setTelework(todayKey, tw)
    setWorkStart(time)
    setTelework(tw)
  }, [todayKey])

  const endWork = useCallback((time: string): void => {
    dailyStore.setWorkEnd(todayKey, time)
    setWorkEnd(time)
  }, [todayKey])

  return { workStart, workEnd, telework, startWork, endWork }
}
