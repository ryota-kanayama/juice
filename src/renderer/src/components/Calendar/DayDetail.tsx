import { useState, useEffect } from 'react'
import type { Session } from '../../types/session'
import { calcSessionMinutes, formatInterval, sortSessionsByStart } from '../../../../shared/sessionUtils'
import styles from './DayDetail.module.css'
import { DurationEditDialog } from '../DurationEditDialog/DurationEditDialog'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useExpandedItem } from '../../hooks/useExpandedItem'

interface Props {
  date: string | null
  sessions: Session[]
  onUpdate?: (session: Session) => Promise<void>
}

export function DayDetail({ date, sessions, onUpdate }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null)
  const [editingDurationValue, setEditingDurationValue] = useState('')

  const { contextMenu, setContextMenu, contextMenuRef } = useContextMenu()
  const { expandedId, setExpandedId } = useExpandedItem()

  useEffect(() => {
    setEditingKey(null)
    setEditingName('')
    setExpandedId(null)
  }, [date])

  if (!date) {
    return <div className={styles.placeholder}>日付を選択してください</div>
  }

  const sortedSessions = sortSessionsByStart(sessions)
  const totalMinutes = sessions.reduce((acc, s) => acc + calcSessionMinutes(s), 0)

  const handleEditStart = (session: Session) => {
    setEditingKey(session.id)
    setEditingName(session.name)
  }

  const handleEditCommit = async () => {
    if (!editingKey || !editingName.trim()) {
      setEditingKey(null)
      return
    }
    const session = sessions.find(s => s.id === editingKey)
    if (!session || !onUpdate) { setEditingKey(null); return }
    const updated = { ...session, name: editingName.trim() }
    setEditingKey(null)
    try {
      await onUpdate(updated)
    } catch {
      // IPC errors are logged by main process
    }
  }

  const handleEditCancel = () => {
    setEditingKey(null)
    setEditingName('')
  }

  const handleDurationEditConfirm = async () => {
    if (!editingDurationId || !onUpdate) { setEditingDurationId(null); return }
    const session = sessions.find(s => s.id === editingDurationId)
    if (!session) { setEditingDurationId(null); return }

    const newTotal = parseInt(editingDurationValue, 10)
    if (isNaN(newTotal) || newTotal < 1) { setEditingDurationId(null); return }

    setEditingDurationId(null)
    try {
      await onUpdate({ ...session, totalTime: newTotal })
    } catch {
      // IPC errors are logged by main process
    }
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.date}>{date}</h3>
      {sessions.length === 0 ? (
        <p className={styles.empty}>この日はジュースを注いでいません</p>
      ) : (
        <>
          <ul className={styles.list}>
            {sortedSessions.map(session => (
              <li
                key={session.id}
                data-session-item
                className={styles.item}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, input')) return
                  setExpandedId(prev => prev === session.id ? null : session.id)
                }}
                onContextMenu={e => {
                  e.preventDefault()
                  setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY })
                }}
              >
                <span
                  className={styles.dot}
                  style={{ background: session.color }}
                  aria-hidden="true"
                />
                <div className={styles.info}>
                  {editingKey === session.id ? (
                    <input
                      className={styles.nameInput}
                      value={editingName}
                      aria-label="セッション名"
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={handleEditCommit}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleEditCommit()
                        if (e.key === 'Escape') handleEditCancel()
                      }}
                      autoFocus
                    />
                  ) : (
                    <>
                      <p className={styles.name}>{session.name}</p>
                      {(session.projectCode || session.workCategory) && (
                        <div className={styles.metaRow}>
                          {session.projectCode && (
                            <span className={styles.metaTag}>{session.projectCode}</span>
                          )}
                          {session.workCategory && (
                            <span className={styles.metaTag}>{session.workCategory}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {session.times.length === 1 ? (
                    <p className={styles.time}>{formatInterval(session.times[0])}</p>
                  ) : (
                    <ul className={styles.timeList}>
                      {(expandedId === session.id ? session.times : session.times.slice(0, 2)).map((t, i) => (
                        <li key={t.startTime} className={`${styles.timeEntry} ${expandedId !== session.id && i === 1 && session.times.length > 2 ? styles.timeEntryFaded : ''}`}>
                          {formatInterval(t)}
                          {t.endTime && (
                            <span className={styles.entryDuration}>
                              {Math.round((new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 60000)}分
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className={styles.duration}>{calcSessionMinutes(session)} 分</span>
                {editingKey === session.id ? (
                  <>
                    <button
                      className={styles.confirmButton}
                      onClick={handleEditCommit}
                      onMouseDown={e => e.preventDefault()}
                      aria-label="保存"
                    >✓</button>
                    <button
                      className={styles.cancelButton}
                      onClick={handleEditCancel}
                      onMouseDown={e => e.preventDefault()}
                      aria-label="キャンセル"
                    >✕</button>
                  </>
                ) : (
                  <button
                    className={styles.editButton}
                    onClick={() => handleEditStart(session)}
                    aria-label="名前を編集"
                  >✏️</button>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.total}>注いだ時間: {totalMinutes}分</p>
        </>
      )}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          data-context-menu
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onUpdate && (sessions.find(s => s.id === contextMenu.sessionId)?.times.length ?? 0) > 0 && (
            <button
              className={styles.contextMenuItemNormal}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                const session = sessions.find(s => s.id === contextMenu.sessionId)
                if (!session) { setContextMenu(null); return }
                setEditingDurationValue(String(calcSessionMinutes(session)))
                setEditingDurationId(session.id)
                setContextMenu(null)
              }}
            >
              合計時間を編集
            </button>
          )}
        </div>
      )}
      {editingDurationId && (
        <DurationEditDialog
          value={editingDurationValue}
          onChange={setEditingDurationValue}
          onConfirm={handleDurationEditConfirm}
          onClose={() => setEditingDurationId(null)}
        />
      )}
    </div>
  )
}
