import { useState, useEffect } from 'react'
import type { Session } from '../../types/session'
import { orderSessions } from '../../../../shared/sessionUtils'
import { dailyStore } from '../../dailyStore'
import { DurationEditDialog } from '../DurationEditDialog/DurationEditDialog'
import { PageIndicator } from '../PageIndicator/PageIndicator'
import { useContextMenu } from '../../hooks/useContextMenu'
import { usePagination } from '../../hooks/usePagination'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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

  const sortedSessions = orderSessions(sessions, date ? dailyStore.getSessionOrder(date) : null)
  const totalMinutes = sessions.reduce((acc, s) => acc + s.totalTime, 0)
  const { page, totalPages, pagedItems: pagedSessions, animKey, changePage } = usePagination(sortedSessions, 4)

  if (!date) {
    return <div className="px-4 py-8 text-center text-[14px] text-[var(--text-muted)]">日付を選択してください</div>
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2.5">
      <div className="mb-3 flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="戻る">←</Button>
        )}
        <h3 className="m-0 text-[15px] font-bold text-[var(--text-primary)]">{date}</h3>
      </div>

      {sessions.length === 0 ? (
        <p className="m-0 text-[13px] text-[var(--text-muted)]">この日はジュースを注いでいません</p>
      ) : (
        <ul
          className="m-0 flex min-h-0 flex-1 list-none animate-slide-up flex-col gap-2.5 p-0"
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
              className="group flex items-start gap-2 rounded-[8px] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2 transition-all [backdrop-filter:blur(8px)] hover:-translate-y-px hover:bg-[var(--bg-hover)] hover:shadow-[var(--shadow-glass)]"
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY })
              }}
            >
              <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: session.color }} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {editingKey === session.id ? (
                  <Input
                    className="h-7 text-sm"
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
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-foreground">{session.name}</span>
                    {(session.projectCode || session.workCategory) && (
                      <div className="mb-px mt-0.5 flex flex-wrap gap-1">
                        {session.projectCode && <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-[7px] text-[11px] leading-[1.6] text-[var(--text-muted)]">{session.projectCode}</span>}
                        {session.workCategory && <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-[7px] text-[11px] leading-[1.6] text-[var(--text-muted)]">{session.workCategory}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
              <span className="ml-auto shrink-0 text-sm font-semibold text-[var(--accent)]">{session.totalTime}分</span>
              {editingKey === session.id ? (
                <>
                  <button className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[#26de81]" onClick={handleEditCommit} onMouseDown={e => e.preventDefault()} aria-label="保存"><Check width={14} height={14} /></button>
                  <button className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[#e74c3c]" onClick={handleEditCancel} onMouseDown={e => e.preventDefault()} aria-label="キャンセル"><Xmark width={14} height={14} /></button>
                </>
              ) : (
                <button className="ml-auto shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0.5 text-sm text-[var(--text-secondary)] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" onClick={() => handleEditStart(session)} aria-label="編集"><EditPencil width={14} height={14} /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      <PageIndicator totalPages={totalPages} currentPage={page} onChangePage={changePage} />

      <Card className="mb-2 mt-auto shrink-0 border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]">
        <CardContent className="flex items-center justify-end px-3 py-2 text-right text-[11px]">
          {sessions.length > 0 && (
            <span>注いだ時間: <strong>{totalMinutes}分</strong></span>
          )}
        </CardContent>
      </Card>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          data-context-menu
          className="fixed z-[1000] min-w-[120px] rounded-[8px] border border-[var(--glass-border)] bg-card py-1 shadow-[var(--shadow-elevated)] [backdrop-filter:blur(20px)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onUpdate && (sessions.find(s => s.id === contextMenu.sessionId)?.times.length ?? 0) > 0 && (
            <button
              className="block w-full cursor-pointer border-0 bg-transparent px-3.5 py-1.5 text-left text-[13px] text-foreground transition-all hover:bg-accent"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                const session = sessions.find(s => s.id === contextMenu.sessionId)
                if (!session) { setContextMenu(null); return }
                setEditingDurationValue(String(session.totalTime))
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
