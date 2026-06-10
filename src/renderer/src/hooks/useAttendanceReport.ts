import { useState } from 'react'
import type { Session } from '../types/session'
import { formatLocalDate, orderSessions } from '../../../shared/sessionUtils'
import { dailyStore } from '../dailyStore'
import { buildAttendanceText, isValidWorkTime } from '../domain/attendance'
import { attendanceRepository } from '../repositories/attendanceRepository'

export interface AttendanceReportState {
  breakMinutes: number
  setBreakMinutes: (value: number) => void
  text: string
  canSend: boolean
  copied: boolean
  sending: boolean
  sendResult: 'success' | 'error' | null
  copy: () => void
  send: () => Promise<void>
}

/** 勤怠レポート画面のオーケストレーション。domain / repository を組み合わせ state を持つ。 */
export function useAttendanceReport(sessions: Session[]): AttendanceReportState {
  const [breakMinutes, setBreakMinutes] = useState(60)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null)

  const todayKey = formatLocalDate(Date.now())
  const workStart = dailyStore.getWorkStart(todayKey)
  const workEnd = dailyStore.getWorkEnd(todayKey)
  const orderedSessions = orderSessions(sessions, dailyStore.getSessionOrder(todayKey))
  const text = buildAttendanceText(orderedSessions, workStart, workEnd, breakMinutes)

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
      setSendResult(result.ok ? 'success' : 'error')
    } catch {
      setSendResult('error')
    } finally {
      setSending(false)
      setTimeout(() => setSendResult(null), 3000)
    }
  }

  return { breakMinutes, setBreakMinutes, text, canSend, copied, sending, sendResult, copy, send }
}
