import { useState, useEffect } from 'react'
import type { Session } from '../types/session'
import { orderSessions } from '../../../shared/sessionUtils'
import { useDailyData } from '../daily/DailyDataContext'
import { buildAttendanceText, isValidWorkTime } from '../domain/attendance'
import { attendanceRepository } from '../repositories/attendanceRepository'

export interface AttendanceReportState {
  breakMinutes: number
  setBreakMinutes: (value: number) => void
  text: string
  /** タイマー合計が実労働時間を超えた分数。超過なければ null */
  overageMinutes: number | null
  canSend: boolean
  copied: boolean
  sending: boolean
  // 'auth' = 未サインイン / セッション切れ、'error' = 入力不備など上流エラー
  sendResult: 'success' | 'auth' | 'error' | null
  copy: () => void
  send: () => Promise<void>
}

/** 勤怠レポート画面のオーケストレーション。domain / repository を組み合わせ state を持つ。 */
export function useAttendanceReport(sessions: Session[], today: string): AttendanceReportState {
  const [breakMinutes, setBreakMinutes] = useState(60)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<'success' | 'auth' | 'error' | null>(null)

  const daily = useDailyData()
  useEffect(() => { daily.ensureMonth(today.slice(0, 7)) }, [today, daily])
  const day = daily.getDay(today)
  const workStart = day?.workStart ?? null
  const workEnd = day?.workEnd ?? null
  const orderedSessions = orderSessions(sessions, day?.sessionOrder ?? null)
  const { text, overageMinutes } = buildAttendanceText(orderedSessions, workStart, workEnd, breakMinutes)

  const canSend = isValidWorkTime(workStart) && isValidWorkTime(workEnd) && sessions.length > 0

  const copy = (): void => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Electron では通常発生しないが、念のため無視
      })
  }

  const send = async (): Promise<void> => {
    setSending(true)
    setSendResult(null)
    try {
      const result = await attendanceRepository.send(text)
      // status 0（未サインイン）/ 401（セッション切れ）は認証エラーとして区別する
      if (result.ok) setSendResult('success')
      else if (result.status === 0 || result.status === 401) setSendResult('auth')
      else setSendResult('error')
    } catch {
      setSendResult('error')
    } finally {
      setSending(false)
      setTimeout(() => setSendResult(null), 3000)
    }
  }

  return { breakMinutes, setBreakMinutes, text, overageMinutes, canSend, copied, sending, sendResult, copy, send }
}
