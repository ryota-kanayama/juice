import { useState } from 'react'
import { formatLocalDate } from '../../../../shared/sessionUtils'
import type { Session } from '../../types/session'
import styles from './AttendanceReport.module.css'
import { NavArrowLeft, Check, Copy, SendDiagonal } from 'iconoir-react'

export function buildAttendanceText(
  sessions: Session[],
  workStart: string | null,
  workEnd: string | null,
  breakMinutes: number
): string {
  const map = new Map<string, { name: string; projectCode: string; workCategory: string; totalMinutes: number }>()

  for (const s of sessions) {
    const key = s.taskId ?? s.id
    for (const t of s.times) {
      if (!t.endTime) continue
      const minutes = Math.round((new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 60000)
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
  }

  const timeLine = `${workStart ?? ''} ${workEnd ?? ''} ${breakMinutes}`
  const taskLines = Array.from(map.values())
    .map(g => `${g.projectCode} ${g.name} ${g.workCategory} ${g.totalMinutes}`)

  return ['勤怠', timeLine, ...taskLines].join('\n')
}

interface Props {
  sessions: Session[]
  onBack: () => void
}

export function AttendanceReport({ sessions, onBack }: Props) {
  const [breakMinutes, setBreakMinutes] = useState(60)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null)

  const todayKey = formatLocalDate(Date.now())
  const workStart = localStorage.getItem(`workStart.${todayKey}`)
  const workEnd = localStorage.getItem(`workEnd.${todayKey}`)

  const text = buildAttendanceText(sessions, workStart, workEnd, breakMinutes)

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
      <div className={styles.backHeader}>
        <button className={styles.backButton} onClick={onBack}><NavArrowLeft width={16} height={16} /></button>
        <span className={styles.title}>ジュースを提供する</span>
      </div>

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
          disabled={sending}
        >
          {sending ? '送信中...' : sendResult === 'success' ? <><Check width={14} height={14} /> 送信しました</> : sendResult === 'error' ? '送信失敗' : <><SendDiagonal width={14} height={14} /> 送る</>}
        </button>
      </div>
    </div>
  )
}
