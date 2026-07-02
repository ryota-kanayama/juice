import { useState, useEffect } from 'react'
import type { Session } from '../../types/session'
import { formatLocalDate, orderSessions } from '../../../../shared/sessionUtils'
import { applySessionEdit } from '../../domain/session'
import { useDailyData } from '../../daily/DailyDataContext'
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'
import { PageIndicator } from '../PageIndicator/PageIndicator'
import { SessionFormDialog, type SessionFormValues } from './SessionFormDialog'
import { SessionItem } from './SessionItem'
import { SessionContextMenu } from './SessionContextMenu'
import { WorkTimeBar } from './WorkTimeBar'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useExpandedItem } from '../../hooks/useExpandedItem'
import { usePagination } from '../../hooks/usePagination'
import { useDragReorder } from '../../hooks/useDragReorder'
import { EMPTY_SUGGESTIONS, type Suggestions } from '../../domain/suggestions'

interface Props {
  sessions: Session[]
  today?: string
  isRunning?: boolean
  onStartMore?: (session: Session) => void
  onUpdate?: (session: Session) => Promise<void>
  onDelete?: (sessionId: string) => void
  onAdjustStartTime?: (newStartMs: number) => void
  onAdd?: (params: SessionFormValues) => void
  workStart?: string | null
  workEnd?: string | null
  onWorkEnd?: (time: string) => void
  breakStart?: string | null
  breakEnd?: string | null
  onBreakStart?: () => void
  onBreakEnd?: () => void
  suggestions?: Suggestions
}

const EMPTY_FORM: SessionFormValues = { name: '', projectCode: '', workCategory: '', totalTime: '' }

export function SessionList({ sessions, today, isRunning, onStartMore, onUpdate, onDelete, onAdjustStartTime, onAdd, workStart = null, workEnd = null, onWorkEnd, breakStart = null, breakEnd = null, onBreakStart, onBreakEnd, suggestions = EMPTY_SUGGESTIONS }: Props) {
  const todayKey = today ?? formatLocalDate(Date.now())
  const daily = useDailyData()
  useEffect(() => { daily.ensureMonth(todayKey.slice(0, 7)) }, [todayKey, daily])

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  // 追加ダイアログは毎回空で開く（過去の入力は候補機能で呼び出せるため下書きは保持しない）
  const [addDraft, setAddDraft] = useState<SessionFormValues>(EMPTY_FORM)
  // 編集ダイアログ。開くたびに対象セッションの値で初期化する
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<SessionFormValues>(EMPTY_FORM)
  // 削除確認ダイアログの対象セッション
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const { contextMenu, setContextMenu, contextMenuRef } = useContextMenu()
  const { expandedId, setExpandedId } = useExpandedItem()

  // カスタム順序（ドラッグ&ドロップ）またはデフォルトの時刻順。日次ストアが正。
  const customOrder = daily.getDay(todayKey)?.sessionOrder ?? null

  // セッションの追加/削除に customOrder を追従させる。死んだIDを除き新規IDを末尾へ。
  useEffect(() => {
    if (!customOrder) return
    const synced = orderSessions(sessions, customOrder).map(s => s.id)
    const changed = synced.length !== customOrder.length || synced.some((id, i) => id !== customOrder[i])
    if (changed) void daily.setDay(todayKey, { sessionOrder: synced })
  }, [sessions, customOrder, todayKey, daily])

  const sortedSessions = orderSessions(sessions, customOrder)
  const totalMinutes = sessions.reduce((acc, s) => acc + s.totalTime, 0)
  const { page, totalPages, pagedItems: pagedSessions, animKey, changePage } = usePagination(sortedSessions, 4)

  // ドラッグ&ドロップ並び替え（ページ跨ぎ・drop/dragend の一度きり確定は hook 側で扱う）
  const {
    dragOverId, listRef,
    handleDragStart, handleDragOver, handleListDragOver, handleDragLeave, handleDrop, handleDragEnd,
  } = useDragReorder({
    orderedIds: sortedSessions.map(s => s.id),
    onReorder: (order) => { void daily.setDay(todayKey, { sessionOrder: order }) },
    page,
    totalPages,
    changePage,
  })

  const openAddDialog = () => {
    setAddDraft(EMPTY_FORM)
    setAddDialogOpen(true)
    setContextMenu(null)
  }

  const handleAddConfirm = () => {
    if (!addDraft.name.trim() || !addDraft.totalTime) return
    onAdd?.({ ...addDraft, name: addDraft.name.trim() })
    setAddDialogOpen(false)
  }

  const handleEditStart = (session: Session) => {
    const lastInterval = session.times[session.times.length - 1]
    const runningMs = lastInterval && !lastInterval.endTime
      ? Date.now() - new Date(lastInterval.startTime).getTime()
      : 0
    setEditTargetId(session.id)
    setEditDraft({
      name: session.name,
      projectCode: session.projectCode,
      workCategory: session.workCategory,
      totalTime: String(session.totalTime + Math.round(runningMs / 60000)),
    })
  }

  const handleEditConfirm = async () => {
    if (!editTargetId || !editDraft.name.trim()) return
    const session = sessions.find(s => s.id === editTargetId)
    if (!session || !onUpdate) { setEditTargetId(null); return }

    const parsed = parseInt(editDraft.totalTime, 10)
    const { session: updated, adjustedStartMs } = applySessionEdit(session, {
      name: editDraft.name.trim(),
      projectCode: editDraft.projectCode.trim(),
      workCategory: editDraft.workCategory.trim(),
      totalMinutes: isNaN(parsed) ? null : parsed,
    })

    setEditTargetId(null)
    try {
      await onUpdate(updated)
      if (adjustedStartMs != null) onAdjustStartTime?.(adjustedStartMs)
    } catch { /* IPC errors are logged by main process */ }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2.5"
      onContextMenu={e => {
        if ((e.target as HTMLElement).closest('[data-session-item]')) return
        e.preventDefault()
        setContextMenu({ sessionId: '', x: e.clientX, y: e.clientY })
      }}
    >
      {sessions.length === 0 ? (
        <div className="m-0 flex-1 py-6 text-center text-[var(--text-muted)]">
          <p className="m-0 text-[13px]">まだジュースを注いでいません</p>
          <p className="m-0 mt-1 text-[11px]">作業名を入力して「注ぐ」で開始できます</p>
        </div>
      ) : (
        <ul
          ref={listRef}
          className="m-0 flex min-h-0 flex-1 list-none animate-slide-up flex-col gap-1.5 overflow-y-auto px-0 py-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          key={animKey}
          onDragOver={handleListDragOver}
          onDrop={handleDrop}
          onWheel={e => {
            if (totalPages <= 1) return
            if (e.deltaY > 0 && page < totalPages - 1) changePage(page + 1)
            if (e.deltaY < 0 && page > 0) changePage(page - 1)
          }}
        >
          {pagedSessions.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              isRunning={isRunning}
              expanded={expandedId === session.id}
              dragOver={dragOverId === session.id}
              onStartMore={onStartMore}
              onToggleExpand={() => setExpandedId(prev => prev === session.id ? null : session.id)}
              onEditStart={() => handleEditStart(session)}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY })
              }}
              onDragStart={e => handleDragStart(e, session.id)}
              onDragOver={e => handleDragOver(e, session.id)}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
            />
          ))}
        </ul>
      )}

      <PageIndicator totalPages={totalPages} currentPage={page} onChangePage={changePage} />

      <WorkTimeBar
        workStart={workStart}
        workEnd={workEnd}
        breakStart={breakStart}
        breakEnd={breakEnd}
        onBreakStart={onBreakStart}
        onBreakEnd={onBreakEnd}
        onWorkEnd={onWorkEnd}
        totalMinutes={totalMinutes}
        hasSessions={sessions.length > 0}
      />

      {contextMenu && (
        <SessionContextMenu
          menu={contextMenu}
          menuRef={contextMenuRef}
          onAdd={openAddDialog}
          onEdit={sessionId => {
            const session = sessions.find(s => s.id === sessionId)
            setContextMenu(null)
            if (session) handleEditStart(session)
          }}
          onDelete={sessionId => {
            setContextMenu(null)
            setPendingDeleteId(sessionId)
          }}
        />
      )}

      <SessionFormDialog
        open={addDialogOpen}
        title="タイマーを追加"
        submitLabel="追加"
        values={addDraft}
        suggestions={suggestions}
        onChange={setAddDraft}
        onSubmit={handleAddConfirm}
        onClose={() => setAddDialogOpen(false)}
      />

      <SessionFormDialog
        open={editTargetId !== null}
        title="タイマーを編集"
        submitLabel="保存"
        values={editDraft}
        suggestions={suggestions}
        onChange={setEditDraft}
        onSubmit={handleEditConfirm}
        onClose={() => setEditTargetId(null)}
      />

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
