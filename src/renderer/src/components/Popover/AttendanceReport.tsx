import type { Session } from '../../types/session'
import { useAttendanceReport } from '../../hooks/useAttendanceReport'
import styles from './AttendanceReport.module.css'
import { Check, Copy, SendDiagonal } from 'iconoir-react'

interface Props {
  sessions: Session[]
}

export function AttendanceReport({ sessions }: Props) {
  const { breakMinutes, setBreakMinutes, text, canSend, copied, sending, sendResult, copy, send } =
    useAttendanceReport(sessions)

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
          onClick={copy}
        >
          {copied ? <><Check width={14} height={14} /> コピーしました</> : <><Copy width={14} height={14} /> コピー</>}
        </button>
        <button
          className={`${styles.sendButton}${sendResult === 'success' ? ` ${styles.sent}` : ''}${sendResult === 'error' ? ` ${styles.sendError}` : ''}`}
          onClick={send}
          disabled={sending || !canSend}
        >
          {sending ? '送信中...' : sendResult === 'success' ? <><Check width={14} height={14} /> 送信しました</> : sendResult === 'error' ? '送信失敗' : <><SendDiagonal width={14} height={14} /> 送る</>}
        </button>
      </div>
    </div>
  )
}
