import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Session } from '../../types/session'
import { formatLocalDate, formatLocalDateTime, formatTimeFromDate, orderSessions } from '../../../../shared/sessionUtils'
import { dailyStore } from '../../dailyStore'
import styles from './SessionList.module.css'
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'
import { PageIndicator } from '../PageIndicator/PageIndicator'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useExpandedItem } from '../../hooks/useExpandedItem'
import { usePagination } from '../../hooks/usePagination'
import { Check, Xmark, Play, EditPencil, Trash, Timer } from 'iconoir-react'

interface AddParams {
  name: string
  projectCode: string
  workCategory: string
  totalTime: string
}

interface Props {
  sessions: Session[]
  today?: string
  isRunning?: boolean
  onStartMore?: (session: Session) => void
  onUpdate?: (session: Session) => Promise<void>
  onDelete?: (sessionId: string) => void
  onAdjustStartTime?: (newStartMs: number) => void
  onAdd?: (params: AddParams) => void
}

export function SessionList({ sessions, today, isRunning, onStartMore, onUpdate, onDelete, onAdjustStartTime, onAdd }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingProjectCode, setEditingProjectCode] = useState('')
  const [editingWorkCategory, setEditingWorkCategory] = useState('')
  const [editingDuration, setEditingDuration] = useState('')

  const todayKey = today ?? formatLocalDate(Date.now())
  const [workStart, setWorkStart] = useState<string | null>(
    () => dailyStore.getWorkStart(todayKey)
  )
  const [workEnd, setWorkEnd] = useState<string | null>(
    () => dailyStore.getWorkEnd(todayKey)
  )

  // 日付が変わったら workStart/workEnd をリセット
  useEffect(() => {
    setWorkStart(dailyStore.getWorkStart(todayKey))
    setWorkEnd(dailyStore.getWorkEnd(todayKey))
  }, [todayKey])

  const [telework, setTelework] = useState(() => dailyStore.getTelework(todayKey))

  const [timePickerMode, setTimePickerMode] = useState<'start' | 'end' | null>(null)
  const [timePickerValue, setTimePickerValue] = useState('')
  const [addDialog, setAddDialog] = useState<AddParams | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { contextMenu, setContextMenu, contextMenuRef } = useContextMenu()
  const { expandedId, setExpandedId } = useExpandedItem()

  // カスタム順序（ドラッグ&ドロップ）またはデフォルトの時刻順
  const [customOrder, setCustomOrder] = useState<string[] | null>(
    () => dailyStore.getSessionOrder(todayKey)
  )

  // 日付変更時にカスタム順序をリセット
  useEffect(() => {
    setCustomOrder(dailyStore.getSessionOrder(todayKey))
  }, [todayKey])

  const sortedSessions = orderSessions(sessions, customOrder)
  const totalMinutes = sessions.reduce((acc, s) => acc + s.totalTime, 0)
  const { page, totalPages, pagedItems: pagedSessions, animKey, changePage } = usePagination(sortedSessions, 4)

  // ドラッグ&ドロップ
  const dragItemRef = useRef<string | null>(null)
  const dragOverItemRef = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const pageChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDragStart = (sessionId: string) => {
    dragItemRef.current = sessionId
  }

  const handleDragOver = (e: React.DragEvent, sessionId: string) => {
    e.preventDefault()
    dragOverItemRef.current = sessionId
    setDragOverId(sessionId)
  }

  // ドラッグ中にリスト上端/下端付近でページ切り替え
  const handleListDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!listRef.current || totalPages <= 1 || !dragItemRef.current) return

    const rect = listRef.current.getBoundingClientRect()
    const x = e.clientX
    const edgeZone = 40 // px

    const nearLeft = x - rect.left < edgeZone && page > 0
    const nearRight = rect.right - x < edgeZone && page < totalPages - 1

    if (nearLeft || nearRight) {
      if (!pageChangeTimerRef.current) {
        pageChangeTimerRef.current = setTimeout(() => {
          pageChangeTimerRef.current = null
          if (nearLeft) changePage(page - 1)
          else if (nearRight) changePage(page + 1)
        }, 400)
      }
    } else {
      if (pageChangeTimerRef.current) {
        clearTimeout(pageChangeTimerRef.current)
        pageChangeTimerRef.current = null
      }
    }
  }

  const handleDragEnd = () => {
    if (pageChangeTimerRef.current) {
      clearTimeout(pageChangeTimerRef.current)
      pageChangeTimerRef.current = null
    }

    const fromId = dragItemRef.current
    const toId = dragOverItemRef.current
    dragItemRef.current = null
    dragOverItemRef.current = null
    setDragOverId(null)

    if (!fromId || !toId || fromId === toId) return

    const currentOrder = sortedSessions.map(s => s.id)
    const fromIdx = currentOrder.indexOf(fromId)
    const toIdx = currentOrder.indexOf(toId)
    if (fromIdx === -1 || toIdx === -1) return

    currentOrder.splice(fromIdx, 1)
    currentOrder.splice(toIdx, 0, fromId)

    dailyStore.setSessionOrder(todayKey, currentOrder)
    setCustomOrder(currentOrder)
  }

  const openAddDialog = () => {
    setAddDialog({ name: '', projectCode: '', workCategory: '', totalTime: '' })
    setContextMenu(null)
  }

  const handleAddConfirm = () => {
    if (!addDialog || !addDialog.name.trim() || !addDialog.totalTime) return
    onAdd?.({ ...addDialog, name: addDialog.name.trim() })
    setAddDialog(null)
  }

  const handleWorkStart = () => {
    setTimePickerValue(formatTimeFromDate(new Date()))
    setTimePickerMode('start')
  }

  const handleWorkEnd = () => {
    setTimePickerValue(formatTimeFromDate(new Date()))
    setTimePickerMode('end')
  }

  const handleTimePickerConfirm = () => {
    if (timePickerMode === 'start') {
      dailyStore.setWorkStart(todayKey, timePickerValue)
      setWorkStart(timePickerValue)
      if (telework) {
        window.electronAPI.teleworkStart()
      }
    } else if (timePickerMode === 'end') {
      dailyStore.setWorkEnd(todayKey, timePickerValue)
      setWorkEnd(timePickerValue)
    }
    setTimePickerMode(null)
  }

  const handleEditStart = (session: Session) => {
    const lastInterval = session.times[session.times.length - 1]
    const runningMs = lastInterval && !lastInterval.endTime
      ? Date.now() - new Date(lastInterval.startTime).getTime()
      : 0
    setEditingKey(session.id)
    setEditingName(session.name)
    setEditingProjectCode(session.projectCode)
    setEditingWorkCategory(session.workCategory)
    setEditingDuration(String(session.totalTime + Math.round(runningMs / 60000)))
  }

  const handleEditCommit = async () => {
    if (!editingKey || !editingName.trim()) { setEditingKey(null); return }
    const session = sessions.find(s => s.id === editingKey)
    if (!session || !onUpdate) { setEditingKey(null); return }
    let updated: Session = {
      ...session,
      name: editingName.trim(),
      projectCode: editingProjectCode.trim(),
      workCategory: editingWorkCategory.trim(),
    }

    const newTotal = parseInt(editingDuration, 10)
    if (!isNaN(newTotal) && newTotal >= 1 && session.times.length > 0) {
      const lastInterval = session.times[session.times.length - 1]
      if (!lastInterval.endTime) {
        const desiredElapsed = Math.max(1, newTotal - session.totalTime)
        const newStartMs = Date.now() - desiredElapsed * 60000
        updated = { ...updated, times: session.times.map(t =>
          t === lastInterval ? { ...t, startTime: formatLocalDateTime(newStartMs) } : t
        ) }
        setEditingKey(null)
        try {
          await onUpdate(updated)
          onAdjustStartTime?.(newStartMs)
        } catch { /* IPC errors are logged by main process */ }
        return
      } else {
        updated = { ...updated, totalTime: newTotal }
      }
    }

    setEditingKey(null)
    try { await onUpdate(updated) } catch { /* IPC errors are logged by main process */ }
  }

  const handleEditCancel = () => {
    setEditingKey(null)
    setEditingName('')
    setEditingProjectCode('')
    setEditingWorkCategory('')
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleEditCommit()
    if (e.key === 'Escape') handleEditCancel()
  }

  return (
    <div
      className={styles.container}
      onContextMenu={e => {
        if ((e.target as HTMLElement).closest('[data-session-item]')) return
        e.preventDefault()
        setContextMenu({ sessionId: '', x: e.clientX, y: e.clientY })
      }}
    >
      {timePickerMode && (
        <div className={styles.timePickerBackdrop} onClick={() => setTimePickerMode(null)}>
          <div className={styles.timePickerDialog} onClick={e => e.stopPropagation()}>
            <p className={styles.timePickerTitle}>
              {timePickerMode === 'start' ? '業務開始時刻' : '業務終了時刻'}
            </p>
            <input
              type="time"
              className={styles.timePickerInput}
              value={timePickerValue}
              onChange={e => setTimePickerValue(e.target.value)}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleTimePickerConfirm()
                if (e.key === 'Escape') setTimePickerMode(null)
              }}
            />
            {timePickerMode === 'start' && (
              <label className={styles.teleworkLabel}>
                <input
                  type="checkbox"
                  className={styles.teleworkCheckbox}
                  checked={telework}
                  onChange={e => {
                    const checked = e.target.checked
                    setTelework(checked)
                    dailyStore.setTelework(todayKey, checked)
                  }}
                />
                <span className={styles.teleworkText}>テレワーク</span>
              </label>
            )}
            <div className={styles.timePickerActions}>
              <button className={styles.timePickerCancel} onClick={() => setTimePickerMode(null)}>キャンセル</button>
              <button className={styles.timePickerConfirm} onClick={handleTimePickerConfirm}>確定</button>
            </div>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <p className={styles.empty}>まだジュースを注いでいません</p>
      ) : (
        <ul
          ref={listRef}
          className={styles.list}
          key={animKey}
          onDragOver={handleListDragOver}
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
              draggable={editingKey !== session.id}
              className={`${styles.item} ${expandedId === session.id ? styles.itemExpanded : ''} ${dragOverId === session.id ? styles.itemDragOver : ''}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, input')) return
                setExpandedId(prev => prev === session.id ? null : session.id)
              }}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY })
              }}
              onDragStart={() => handleDragStart(session.id)}
              onDragOver={(e) => handleDragOver(e, session.id)}
              onDragLeave={() => setDragOverId(null)}
              onDragEnd={handleDragEnd}
            >
              <span className={styles.dot} style={{ background: session.color }} aria-hidden="true" />
              <div className={styles.info}>
                {editingKey === session.id ? (
                  <div className={styles.editInputs}>
                    <input
                      className={styles.metaInput}
                      value={editingProjectCode}
                      onChange={e => setEditingProjectCode(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="PJコード"
                      aria-label="PJコード"
                    />
                    <input
                      className={styles.nameInput}
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      aria-label="セッション名"
                      autoFocus
                    />
                    <input
                      className={styles.metaInput}
                      value={editingWorkCategory}
                      onChange={e => setEditingWorkCategory(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="作業区分"
                      aria-label="作業区分"
                    />
                  </div>
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
              {editingKey === session.id ? (
                <input
                  className={styles.durationInput}
                  value={editingDuration}
                  onChange={e => setEditingDuration(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="合計時間（分）"
                  type="number"
                  min="1"
                />
              ) : (
                <span className={styles.duration}>{session.totalTime}分</span>
              )}
              {editingKey === session.id ? (
                <>
                  <button className={styles.confirmButton} onClick={handleEditCommit} onMouseDown={e => e.preventDefault()} aria-label="保存"><Check width={14} height={14} /></button>
                  <button className={styles.cancelButton} onClick={handleEditCancel} onMouseDown={e => e.preventDefault()} aria-label="キャンセル"><Xmark width={14} height={14} /></button>
                </>
              ) : (
                <>
                  {!isRunning && onStartMore && (
                    <button className={styles.moreButton} onClick={() => onStartMore(session)} aria-label="追加で注ぐ"><Play width={14} height={14} /></button>
                  )}
                  <button className={styles.editButton} onClick={() => handleEditStart(session)} aria-label="編集"><EditPencil width={14} height={14} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <PageIndicator totalPages={totalPages} currentPage={page} onChangePage={changePage} />

      <div className={styles.total}>
        <div className={styles.workTimeRow}>
          {!workEnd && (
            <button
              className={workStart ? styles.endButton : styles.startButton}
              onClick={workStart ? handleWorkEnd : handleWorkStart}
            >
              {workStart ? '終了' : '開始'}
            </button>
          )}
          <span className={styles.workTime}>
            {workStart ? `${workStart}${workEnd ? `〜${workEnd}` : '〜'}` : ''}
          </span>
        </div>
        {sessions.length > 0 && (
          <span>今日注いだ時間: <strong>{totalMinutes}分</strong></span>
        )}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          data-context-menu
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className={styles.contextMenuItemNormal} onMouseDown={e => e.preventDefault()} onClick={openAddDialog}>
            <Timer width={14} height={14} /> 追加
          </button>
          {contextMenu.sessionId !== '' && (
            <button
              className={styles.contextMenuItem}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                const id = contextMenu.sessionId
                setContextMenu(null)
                setPendingDeleteId(id)
              }}
            >
              <Trash width={14} height={14} /> 流す
            </button>
          )}
        </div>
      )}

      {addDialog && (
        <div className={styles.timePickerBackdrop} onClick={() => setAddDialog(null)}>
          <div className={styles.addDialog} onClick={e => e.stopPropagation()}>
            <p className={styles.timePickerTitle}>タイマーを追加</p>
            <div className={styles.addDialogFields}>
              <input
                className={styles.addDialogInput}
                placeholder="作業名（必須）"
                value={addDialog.name}
                onChange={e => setAddDialog(d => d && { ...d, name: e.target.value })}
                autoFocus
                onKeyDown={e => { if (e.key === 'Escape') setAddDialog(null) }}
              />
              <div className={styles.addDialogRow}>
                <input
                  className={styles.addDialogInputSmall}
                  placeholder="PJコード"
                  value={addDialog.projectCode}
                  onChange={e => setAddDialog(d => d && { ...d, projectCode: e.target.value })}
                />
                <input
                  className={styles.addDialogInputSmall}
                  placeholder="作業区分"
                  value={addDialog.workCategory}
                  onChange={e => setAddDialog(d => d && { ...d, workCategory: e.target.value })}
                />
              </div>
              <div className={styles.addDialogRow}>
                <div className={styles.addDialogTimeField}>
                  <span className={styles.addDialogTimeLabel}>時間</span>
                  <input
                    type="number"
                    min="1"
                    className={styles.addDialogTimeInput}
                    placeholder="分"
                    value={addDialog.totalTime}
                    onChange={e => setAddDialog(d => d && { ...d, totalTime: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddConfirm(); if (e.key === 'Escape') setAddDialog(null) }}
                  />
                  <span className={styles.addDialogTimeLabel}>分</span>
                </div>
              </div>
            </div>
            <div className={styles.timePickerActions}>
              <button className={styles.timePickerCancel} onClick={() => setAddDialog(null)}>キャンセル</button>
              <button
                className={styles.timePickerConfirm}
                onClick={handleAddConfirm}
                disabled={!addDialog.name.trim() || !addDialog.totalTime}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          message="本当に流しますか？"
          confirmLabel="流す"
          onConfirm={() => { onDelete?.(pendingDeleteId); setPendingDeleteId(null) }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  )
}
