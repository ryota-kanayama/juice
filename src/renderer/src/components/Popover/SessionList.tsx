import { useState, useEffect } from 'react'
import type { Session } from '../../types/session'
import { formatLocalDate, formatTimeFromDate, orderSessions } from '../../../../shared/sessionUtils'
import { applySessionEdit } from '../../domain/session'
import { useDailyData } from '../../daily/DailyDataContext'
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'
import { PageIndicator } from '../PageIndicator/PageIndicator'
import { SessionFormDialog, type SessionFormValues } from './SessionFormDialog'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useExpandedItem } from '../../hooks/useExpandedItem'
import { usePagination } from '../../hooks/usePagination'
import { useDragReorder } from '../../hooks/useDragReorder'
import { EMPTY_SUGGESTIONS, type Suggestions } from '../../domain/suggestions'
import { TimeField } from '@/components/ui/time-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { resolveJuiceColor } from '../../domain/colors'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Play, EditPencil, Trash, Timer } from 'iconoir-react'

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

  const [endPickerOpen, setEndPickerOpen] = useState(false)
  const [timePickerValue, setTimePickerValue] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  // 追加ダイアログは毎回空で開く（過去の入力は候補機能で呼び出せるため下書きは保持しない）
  const [addDraft, setAddDraft] = useState<SessionFormValues>(EMPTY_FORM)
  // 編集ダイアログ。開くたびに対象セッションの値で初期化する
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<SessionFormValues>(EMPTY_FORM)
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

  const handleWorkEnd = () => {
    setTimePickerValue(formatTimeFromDate(new Date()))
    setEndPickerOpen(true)
  }

  const handleTimePickerConfirm = () => {
    onWorkEnd?.(timePickerValue)
    setEndPickerOpen(false)
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
      <Dialog open={endPickerOpen} onOpenChange={open => { if (!open) setEndPickerOpen(false) }}>
        <DialogContent className="max-w-[220px]" aria-describedby={undefined}>
          <DialogTitle>業務終了時刻</DialogTitle>
          <div onKeyDown={e => { if (e.key === 'Enter') handleTimePickerConfirm() }}>
            <TimeField
              aria-label="業務終了時刻"
              className="h-11 w-full justify-center text-xl"
              value={timePickerValue}
              onChange={setTimePickerValue}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndPickerOpen(false)}>キャンセル</Button>
            <Button onClick={handleTimePickerConfirm}>確定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {sessions.length === 0 ? (
        <p className="m-0 flex-1 py-6 text-center text-[13px] text-[var(--text-muted)]">まだジュースを注いでいません</p>
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
            <li
              key={session.id}
              data-session-item
              draggable
              className={`group flex cursor-grab items-start gap-2 rounded-[8px] border bg-card px-2.5 py-2 transition-all duration-200 hover:bg-accent active:cursor-grabbing ${expandedId === session.id ? 'bg-accent' : ''} ${dragOverId === session.id ? 'border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-light)]' : 'border-border'}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, input, [role="listbox"]')) return
                setExpandedId(prev => prev === session.id ? null : session.id)
              }}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('button, input, [role="listbox"]')) return
                handleEditStart(session)
              }}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY })
              }}
              onDragStart={(e) => handleDragStart(e, session.id)}
              onDragOver={(e) => handleDragOver(e, session.id)}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
            >
              <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: resolveJuiceColor(session.color) }} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-foreground transition-colors group-hover:text-[var(--accent)]">{session.name}</span>
                {(session.projectCode || session.workCategory) && (
                  <div className="mt-px flex flex-wrap gap-1">
                    {session.projectCode && <span className="rounded-[6px] border border-border bg-muted px-1.5 text-[11px] leading-[1.6] text-muted-foreground">{session.projectCode}</span>}
                    {session.workCategory && <span className="rounded-[6px] border border-border bg-muted px-1.5 text-[11px] leading-[1.6] text-muted-foreground">{session.workCategory}</span>}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-[13px] font-semibold text-[var(--accent)]">{session.totalTime}分</span>
              {!isRunning && onStartMore && (
                <TooltipProvider delayDuration={450}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-[#26de81] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" onClick={() => onStartMore(session)} aria-label="追加で注ぐ"><Play width={14} height={14} /></button>
                    </TooltipTrigger>
                    <TooltipContent>追加で注ぐ</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </li>
          ))}
        </ul>
      )}

      <PageIndicator totalPages={totalPages} currentPage={page} onChangePage={changePage} />

      <Card className="mb-2 mt-2">
        <CardContent className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {workStart && !workEnd && (
              breakStart === null ? (
                <Button variant="outline" size="sm" className="h-7 border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950" onClick={onBreakStart}>
                  休憩
                </Button>
              ) : breakEnd === null ? (
                <Button variant="outline" size="sm" className="h-7 border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950" onClick={onBreakEnd}>
                  休憩終了
                </Button>
              ) : (
                <Button variant="destructive" size="sm" className="h-7" onClick={handleWorkEnd}>
                  終了
                </Button>
              )
            )}
            <span className="min-w-[90px] text-[11px] text-[var(--text-muted)]">
              {workStart ? `${workStart}${workEnd ? `〜${workEnd}` : '〜'}` : ''}
            </span>
          </div>
          {sessions.length > 0 && (
            <span>今日注いだ時間: <strong>{totalMinutes}分</strong></span>
          )}
        </CardContent>
      </Card>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          data-context-menu
          className="fixed z-[1000] min-w-[120px] rounded-[8px] border border-border bg-card py-1 shadow-[var(--shadow-elevated)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-4 py-2 text-left text-[13px] text-foreground transition-colors duration-200 hover:bg-accent" onMouseDown={e => e.preventDefault()} onClick={openAddDialog}>
            <Timer width={14} height={14} /> 追加
          </button>
          {contextMenu.sessionId !== '' && (
            <>
              <button
                className="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-4 py-2 text-left text-[13px] text-foreground transition-colors duration-200 hover:bg-accent"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  const session = sessions.find(s => s.id === contextMenu.sessionId)
                  setContextMenu(null)
                  if (session) handleEditStart(session)
                }}
              >
                <EditPencil width={14} height={14} /> 編集
              </button>
              <button
                className="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-4 py-2 text-left text-[13px] text-[#e74c3c] transition-colors duration-200 hover:bg-accent"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  const id = contextMenu.sessionId
                  setContextMenu(null)
                  setPendingDeleteId(id)
                }}
              >
                <Trash width={14} height={14} /> 流す
              </button>
            </>
          )}
        </div>
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
