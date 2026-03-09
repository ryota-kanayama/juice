import { useState } from 'react'
import { formatLocalDate, calcSessionMinutes, sortSessionsByStart } from '../../../../shared/sessionUtils'
import type { Session } from '../../types/session'
import styles from './AttendanceReport.module.css'
import { Check, Copy, SendDiagonal } from 'iconoir-react'

function getOrderedSessions(sessions: Session[], todayKey: string): Session[] {
  const orderKey = `sessionOrder.${todayKey}`
  const stored = localStorage.getItem(orderKey)
  if (!stored) return sortSessionsByStart(sessions)
  const customOrder: string[] = JSON.parse(stored)
  const byId = new Map(sessions.map(s => [s.id, s]))
  const ordered: Session[] = []
  for (const id of customOrder) {
    const s = byId.get(id)
    if (s) { ordered.push(s); byId.delete(id) }
  }
  for (const s of sortSessionsByStart([...byId.values()])) {
    ordered.push(s)
  }
  return ordered
}

function parseHHMM(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function buildAttendanceText(
  sessions: Session[],
  workStart: string | null,
  workEnd: string | null,
  breakMinutes: number
): string {
  const map = new Map<string, { name: string; projectCode: string; workCategory: string; totalMinutes: number }>()

  for (const s of sessions) {
    const key = s.taskId ?? s.id
    const minutes = calcSessionMinutes(s)
    const existing = map.get(key)
    if (existing) {
      existing.totalMinutes += minutes
    } else {
      map.set(key, {
        name: s.name,
        projectCode: s.projectCode ?? '',
        workCategory: s.workCategory ?? '',
        totalMinutes: minutes,
      })
    }
  }

  const groups = Array.from(map.values()).filter(g => g.totalMinutes > 0)

  // 勤務時間から休憩を引いた実労働時間と、タイマー合計の差分を最後のタスクに加算
  if (groups.length > 0 && workStart && workEnd) {
    const startMin = parseHHMM(workStart)
    const endMin = parseHHMM(workEnd)
    if (startMin != null && endMin != null) {
      const actualWorkMinutes = endMin - startMin - breakMinutes
      const timerTotal = groups.reduce((sum, g) => sum + g.totalMinutes, 0)
      const diff = actualWorkMinutes - timerTotal
      if (diff > 0) {
        groups[groups.length - 1].totalMinutes += diff
      }
    }
  }

  const timeLine = `${workStart ?? ''} ${workEnd ?? ''} ${breakMinutes}`
  const taskLines = groups.map(g => `${g.projectCode} ${g.name} ${g.workCategory} ${g.totalMinutes}`)

  return ['勤怠', timeLine, ...taskLines].join('\n')
}

interface Props {
  sessions: Session[]
}

export function AttendanceReport({ sessions }: Props) {
  const [breakMinutes, setBreakMinutes] = useState(60)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null)

  const todayKey = formatLocalDate(Date.now())
  const workStart = localStorage.getItem(`workStart.${todayKey}`)
  const workEnd = localStorage.getItem(`workEnd.${todayKey}`)

  const orderedSessions = getOrderedSessions(sessions, todayKey)
  const text = buildAttendanceText(orderedSessions, workStart, workEnd, breakMinutes)

  const isValidTime = (t: string | null): boolean => !!t && /^\d{1,2}:\d{2}$/.test(t)
  const canSend = isValidTime(workStart) && isValidTime(workEnd) && sessions.length > 0

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Electron では通常発生しないが、念のため無視
      })
  }

  const handleSend = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const result = await window.electronAPI.sendAttendance(text)
      setSendResult(result.ok ? 'success' : 'error')
    } catch {
      setSendResult('error')
    } finally {
      setSending(false)
      setTimeout(() => setSendResult(null), 3000)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.breakRow}>
        <span className={styles.breakLabel}>休憩</span>
        <input
          type="number"
          className={styles.breakInput}
          value={breakMinutes}
          min={0}
          onChange={e => setBreakMinutes(Number(e.target.value))}
        />
        <span className={styles.breakUnit}>分</span>
      </div>

      <pre className={styles.preview}>{text}</pre>

      <div className={styles.buttonRow}>
        <button
          className={`${styles.copyButton}${copied ? ` ${styles.copied}` : ''}`}
          onClick={handleCopy}
        >
          {copied ? <><Check width={14} height={14} /> コピーしました</> : <><Copy width={14} height={14} /> コピー</>}
        </button>
        <button
          className={`${styles.sendButton}${sendResult === 'success' ? ` ${styles.sent}` : ''}${sendResult === 'error' ? ` ${styles.sendError}` : ''}`}
          onClick={handleSend}
          disabled={sending || !canSend}
        >
          {sending ? '送信中...' : sendResult === 'success' ? <><Check width={14} height={14} /> 送信しました</> : sendResult === 'error' ? '送信失敗' : <><SendDiagonal width={14} height={14} /> 送る</>}
        </button>
      </div>
    </div>
  )
}
