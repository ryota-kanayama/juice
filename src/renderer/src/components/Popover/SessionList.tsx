import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Session } from '../../types/session'
import { formatLocalDate, formatTimeFromDate, orderSessions } from '../../../../shared/sessionUtils'
import { applySessionEdit } from '../../domain/session'
import { dailyStore } from '../../dailyStore'
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'
import { PageIndicator } from '../PageIndicator/PageIndicator'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useExpandedItem } from '../../hooks/useExpandedItem'
import { usePagination } from '../../hooks/usePagination'
import { Input } from '@/components/ui/input'
import { SuggestInput } from '@/components/ui/suggest-input'
import { EMPTY_SUGGESTIONS, type Suggestions } from '../../domain/suggestions'
import { TimeField } from '@/components/ui/time-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
  workStart?: string | null
  workEnd?: string | null
  onWorkEnd?: (time: string) => void
  suggestions?: Suggestions
}

export function SessionList({ sessions, today, isRunning, onStartMore, onUpdate, onDelete, onAdjustStartTime, onAdd, workStart = null, workEnd = null, onWorkEnd, suggestions = EMPTY_SUGGESTIONS }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingProjectCode, setEditingProjectCode] = useState('')
  const [editingWorkCategory, setEditingWorkCategory] = useState('')
  const [editingDuration, setEditingDuration] = useState('')

  const todayKey = today ?? formatLocalDate(Date.now())

  const [endPickerOpen, setEndPickerOpen] = useState(false)
  const [timePickerValue, setTimePickerValue] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  // 下書きは閉じても保持し、追加成功時のみクリアする（アプリ起動中のみメモリ保持）
  const EMPTY_ADD_DRAFT: AddParams = { name: '', projectCode: '', workCategory: '', totalTime: '' }
  const [addDraft, setAddDraft] = useState<AddParams>(EMPTY_ADD_DRAFT)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const nameOptions = suggestions.names.map(s => ({
    value: s.name,
    sub: [s.projectCode, s.workCategory].filter(Boolean).join(' / ') || undefined,
  }))
  const projectCodeOptions = suggestions.projectCodes.map(v => ({ value: v }))
  const workCategoryOptions = suggestions.workCategories.map(v => ({ value: v }))
  const findNameSuggestion = (value: string) => suggestions.names.find(n => n.name === value)

  // 追加ダイアログ内でドロップダウンが開いている数カウンタ（Escape 処理用）
  const [addSuggestOpenCount, setAddSuggestOpenCount] = useState(0)

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
    setAddDialogOpen(true)
    setContextMenu(null)
  }

  const handleAddConfirm = () => {
    if (!addDraft.name.trim() || !addDraft.totalTime) return
    onAdd?.({ ...addDraft, name: addDraft.name.trim() })
    setAddDraft(EMPTY_ADD_DRAFT)
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

    const parsed = parseInt(editingDuration, 10)
    const { session: updated, adjustedStartMs } = applySessionEdit(session, {
      name: editingName.trim(),
      projectCode: editingProjectCode.trim(),
      workCategory: editingWorkCategory.trim(),
      totalMinutes: isNaN(parsed) ? null : parsed,
    })

    setEditingKey(null)
    try {
      await onUpdate(updated)
      if (adjustedStartMs != null) onAdjustStartTime?.(adjustedStartMs)
    } catch { /* IPC errors are logged by main process */ }
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
              className={`group flex cursor-grab items-start gap-2 rounded-[8px] border bg-card px-2.5 py-2 transition-all duration-200 hover:bg-accent active:cursor-grabbing ${expandedId === session.id ? 'bg-accent' : ''} ${dragOverId === session.id ? 'border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-light)]' : 'border-border'}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, input, [role="listbox"]')) return
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
              <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: session.color }} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {editingKey === session.id ? (
                  <div className="flex flex-col gap-[3px]">
                    <SuggestInput
                      className="h-7 text-xs"
                      value={editingProjectCode}
                      onChange={e => setEditingProjectCode(e.target.value)}
                      options={projectCodeOptions}
                      onSelectOption={o => setEditingProjectCode(o.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="PJコード"
                      aria-label="PJコード"
                    />
                    <SuggestInput
                      className="h-7 text-sm font-medium"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      options={nameOptions}
                      onSelectOption={o => {
                        const meta = findNameSuggestion(o.value)
                        setEditingName(o.value)
                        if (meta) {
                          setEditingProjectCode(meta.projectCode)
                          setEditingWorkCategory(meta.workCategory)
                        }
                      }}
                      onKeyDown={handleKeyDown}
                      aria-label="セッション名"
                      autoFocus
                    />
                    <SuggestInput
                      className="h-7 text-xs"
                      value={editingWorkCategory}
                      onChange={e => setEditingWorkCategory(e.target.value)}
                      options={workCategoryOptions}
                      onSelectOption={o => setEditingWorkCategory(o.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="作業区分"
                      aria-label="作業区分"
                    />
                  </div>
                ) : (
                  <>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-foreground transition-colors group-hover:text-[var(--accent)]">{session.name}</span>
                    {(session.projectCode || session.workCategory) && (
                      <div className="mt-px flex flex-wrap gap-1">
                        {session.projectCode && <span className="rounded-[6px] border border-border bg-muted px-1.5 text-[11px] leading-[1.6] text-muted-foreground">{session.projectCode}</span>}
                        {session.workCategory && <span className="rounded-[6px] border border-border bg-muted px-1.5 text-[11px] leading-[1.6] text-muted-foreground">{session.workCategory}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
              {editingKey === session.id ? (
                <Input
                  className="h-7 w-16 shrink-0 text-right text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={editingDuration}
                  onChange={e => setEditingDuration(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="合計時間（分）"
                  type="number"
                  min="1"
                />
              ) : (
                <span className="shrink-0 text-[13px] font-semibold text-[var(--accent)]">{session.totalTime}分</span>
              )}
              {editingKey === session.id ? (
                <>
                  <button className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-[13px] text-muted-foreground transition-colors hover:text-[#26de81]" onClick={handleEditCommit} onMouseDown={e => e.preventDefault()} aria-label="保存"><Check width={14} height={14} /></button>
                  <button className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-[13px] text-muted-foreground transition-colors hover:text-[#e74c3c]" onClick={handleEditCancel} onMouseDown={e => e.preventDefault()} aria-label="キャンセル"><Xmark width={14} height={14} /></button>
                </>
              ) : (
                <>
                  {!isRunning && onStartMore && (
                    <button className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-[#26de81] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" onClick={() => onStartMore(session)} aria-label="追加で注ぐ"><Play width={14} height={14} /></button>
                  )}
                  <button className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-[13px] text-muted-foreground opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" onClick={() => handleEditStart(session)} aria-label="編集"><EditPencil width={14} height={14} /></button>
                </>
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
              <Button
                variant="destructive"
                size="sm"
                className="h-7"
                onClick={handleWorkEnd}
              >
                終了
              </Button>
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
          )}
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={open => { if (!open) setAddDialogOpen(false) }}>
        <DialogContent
          aria-describedby={undefined}
          onEscapeKeyDown={e => { if (addSuggestOpenCount > 0) e.preventDefault() }}
        >
          <DialogTitle>タイマーを追加</DialogTitle>
          <div className="flex flex-col gap-2">
            <SuggestInput
              placeholder="作業名（必須）"
              value={addDraft.name}
              onChange={e => setAddDraft(d => ({ ...d, name: e.target.value }))}
              options={nameOptions}
              onSelectOption={o => {
                const meta = findNameSuggestion(o.value)
                setAddDraft(d => ({
                  ...d,
                  name: o.value,
                  projectCode: meta ? meta.projectCode : d.projectCode,
                  workCategory: meta ? meta.workCategory : d.workCategory,
                }))
              }}
              onOpenChange={open => setAddSuggestOpenCount(c => open ? c + 1 : Math.max(0, c - 1))}
              autoFocus
            />
            <div className="flex gap-2">
              <SuggestInput
                className="text-xs"
                placeholder="PJコード"
                value={addDraft.projectCode}
                onChange={e => setAddDraft(d => ({ ...d, projectCode: e.target.value }))}
                options={projectCodeOptions}
                onSelectOption={o => setAddDraft(d => ({ ...d, projectCode: o.value }))}
                onOpenChange={open => setAddSuggestOpenCount(c => open ? c + 1 : Math.max(0, c - 1))}
              />
              <SuggestInput
                className="text-xs"
                placeholder="作業区分"
                value={addDraft.workCategory}
                onChange={e => setAddDraft(d => ({ ...d, workCategory: e.target.value }))}
                options={workCategoryOptions}
                onSelectOption={o => setAddDraft(d => ({ ...d, workCategory: o.value }))}
                onOpenChange={open => setAddSuggestOpenCount(c => open ? c + 1 : Math.max(0, c - 1))}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">時間</span>
              <Input
                type="number"
                min="1"
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="分"
                value={addDraft.totalTime}
                onChange={e => setAddDraft(d => ({ ...d, totalTime: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleAddConfirm() }}
              />
              <span className="text-xs text-muted-foreground">分</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>キャンセル</Button>
            <Button
              onClick={handleAddConfirm}
              disabled={!addDraft.name.trim() || !addDraft.totalTime}
            >
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
