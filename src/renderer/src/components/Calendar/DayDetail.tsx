import { useState, useEffect } from 'react'
import type { Session } from '../../types/session'
import { calcSessionMinutes, sortSessionsByStart } from '../../../../shared/sessionUtils'
import styles from './DayDetail.module.css'
import { DurationEditDialog } from '../DurationEditDialog/DurationEditDialog'
import { PageIndicator } from '../PageIndicator/PageIndicator'
import { useContextMenu } from '../../hooks/useContextMenu'
import { usePagination } from '../../hooks/usePagination'
import { Check, Xmark, EditPencil } from 'iconoir-react'

interface Props {
  date: string | null
  sessions: Session[]
  onUpdate?: (session: Session) => Promise<void>
  onBack?: () => void
}

export function DayDetail({ date, sessions, onUpdate, onBack }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null)
  const [editingDurationValue, setEditingDurationValue] = useState('')

  const { contextMenu, setContextMenu, contextMenuRef } = useContextMenu()

  useEffect(() => {
    setEditingKey(null)
    setEditingName('')
  }, [date])

  const sortedSessions = (() => {
    if (!date) return sortSessionsByStart(sessions)
    const stored = localStorage.getItem(`sessionOrder.${date}`)
    if (!stored) return sortSessionsByStart(sessions)
    const order: string[] = JSON.parse(stored)
    const byId = new Map(sessions.map(s => [s.id, s]))
    const ordered: Session[] = []
    for (const id of order) {
      const s = byId.get(id)
      if (s) { ordered.push(s); byId.delete(id) }
    }
    for (const s of sortSessionsByStart([...byId.values()])) {
      ordered.push(s)
    }
    return ordered
  })()
  const totalMinutes = sessions.reduce((acc, s) => acc + calcSessionMinutes(s), 0)
  const { page, totalPages, pagedItems: pagedSessions, animKey, changePage } = usePagination(sortedSessions, 4)

  if (!date) {
    return <div className={styles.placeholder}>日付を選択してください</div>
  }

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
      <div className={styles.header}>
        {onBack && (
          <button className={styles.backButton} onClick={onBack} aria-label="戻る">←</button>
        )}
        <h3 className={styles.date}>{date}</h3>
      </div>

      {sessions.length === 0 ? (
        <p className={styles.empty}>この日はジュースを注いでいません</p>
      ) : (
        <ul
          className={styles.list}
          key={animKey}
          onWheel={e => {
            if (totalPages <= 1) return
            if (e.deltaY > 0 && page < totalPages - 1) changePage(page + 1)
            if (e.deltaY < 0 && page > 0) changePage(page - 1)
          }}
        >
          {pagedSessions.map(session => (
            <li
              key={session.id}
              data-session-item
              className={styles.item}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY })
              }}
            >
              <span className={styles.dot} style={{ background: session.color }} aria-hidden="true" />
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
                    <span className={styles.name}>{session.name}</span>
                    {(session.projectCode || session.workCategory) && (
                      <div className={styles.metaRow}>
                        {session.projectCode && <span className={styles.metaTag}>{session.projectCode}</span>}
                        {session.workCategory && <span className={styles.metaTag}>{session.workCategory}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
              <span className={styles.duration}>{calcSessionMinutes(session)}分</span>
              {editingKey === session.id ? (
                <>
                  <button className={styles.confirmButton} onClick={handleEditCommit} onMouseDown={e => e.preventDefault()} aria-label="保存"><Check width={14} height={14} /></button>
                  <button className={styles.cancelButton} onClick={handleEditCancel} onMouseDown={e => e.preventDefault()} aria-label="キャンセル"><Xmark width={14} height={14} /></button>
                </>
              ) : (
                <button className={styles.editButton} onClick={() => handleEditStart(session)} aria-label="編集"><EditPencil width={14} height={14} /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      <PageIndicator totalPages={totalPages} currentPage={page} onChangePage={changePage} />

      <div className={styles.total}>
        {sessions.length > 0 && (
          <span>注いだ時間: <strong>{totalMinutes}分</strong></span>
        )}
      </div>

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
