import { useState, useEffect } from 'react'
import type { Session } from '../../types/session'
import { orderSessions } from '../../../../shared/sessionUtils'
import { applySessionEdit } from '../../domain/session'
import { EMPTY_SUGGESTIONS, type Suggestions } from '../../domain/suggestions'
import { PageIndicator } from '../PageIndicator/PageIndicator'
import { SessionFormDialog, type SessionFormValues } from '../Popover/SessionFormDialog'
import { useContextMenu } from '../../hooks/useContextMenu'
import { usePagination } from '../../hooks/usePagination'
import { Card, CardContent } from '@/components/ui/card'
import { Hint } from '@/components/ui/hint'
import { Button } from '@/components/ui/button'
import { EditPencil } from 'iconoir-react'
import { resolveJuiceColor } from '../../domain/colors'

interface Props {
  date: string | null
  sessions: Session[]
  sessionOrder?: string[] | null
  onUpdate?: (session: Session) => Promise<void>
  onBack?: () => void
  suggestions?: Suggestions
  onOpenAnalysis?: () => void
}

const EMPTY_FORM: SessionFormValues = { name: '', projectCode: '', workCategory: '', totalTime: '' }

export function DayDetail({ date, sessions, sessionOrder = null, onUpdate, onBack, suggestions = EMPTY_SUGGESTIONS, onOpenAnalysis }: Props) {
  // 編集ダイアログ。開くたびに対象セッションの値で初期化する
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<SessionFormValues>(EMPTY_FORM)

  const { contextMenu, setContextMenu, contextMenuRef } = useContextMenu()

  useEffect(() => {
    setEditTargetId(null)
  }, [date])

  const sortedSessions = orderSessions(sessions, sessionOrder)
  const totalMinutes = sessions.reduce((acc, s) => acc + s.totalTime, 0)
  const { page, totalPages, pagedItems: pagedSessions, animKey, changePage } = usePagination(sortedSessions, 4)

  if (!date) {
    return <div className="px-4 py-8 text-center text-[14px] text-[var(--text-muted)]">日付を選択してください</div>
  }

  const handleEditStart = (session: Session) => {
    setEditTargetId(session.id)
    setEditDraft({
      name: session.name,
      projectCode: session.projectCode,
      workCategory: session.workCategory,
      totalTime: String(session.totalTime),
    })
  }

  const handleEditConfirm = async () => {
    if (!editTargetId || !editDraft.name.trim()) return
    const session = sessions.find(s => s.id === editTargetId)
    if (!session || !onUpdate) { setEditTargetId(null); return }

    const parsed = parseInt(editDraft.totalTime, 10)
    const { session: updated } = applySessionEdit(session, {
      name: editDraft.name.trim(),
      projectCode: editDraft.projectCode.trim(),
      workCategory: editDraft.workCategory.trim(),
      totalMinutes: isNaN(parsed) ? null : parsed,
    })

    setEditTargetId(null)
    try {
      await onUpdate(updated)
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
        <p className="m-0 flex-1 text-[13px] text-[var(--text-muted)]">この日はジュースを注いでいません</p>
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
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('button, input, [role="listbox"]')) return
                if (onUpdate) handleEditStart(session)
              }}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY })
              }}
            >
              <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: resolveJuiceColor(session.color) }} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-foreground">{session.name}</span>
                {(session.projectCode || session.workCategory) && (
                  <div className="mb-px mt-0.5 flex flex-wrap gap-1">
                    {session.projectCode && <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-[7px] text-[11px] leading-[1.6] text-[var(--text-muted)]">{session.projectCode}</span>}
                    {session.workCategory && <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-[7px] text-[11px] leading-[1.6] text-[var(--text-muted)]">{session.workCategory}</span>}
                  </div>
                )}
              </div>
              <span className="ml-auto shrink-0 text-sm font-semibold text-[var(--accent)]">{session.totalTime}分</span>
            </li>
          ))}
        </ul>
      )}

      <PageIndicator totalPages={totalPages} currentPage={page} onChangePage={changePage} />

      <Hint label={onOpenAnalysis ? 'ダブルクリックで週次分析を表示' : undefined}>
        <Card
          className={`mb-2 mt-2 shrink-0 border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]${onOpenAnalysis ? ' cursor-pointer' : ''}`}
          onDoubleClick={onOpenAnalysis}
        >
          <CardContent className="flex items-center justify-between px-3 py-2 text-[11px]">
            {onOpenAnalysis && (
              <span className="text-[var(--text-muted)]">ダブルクリックで週次分析を開く</span>
            )}
            {sessions.length > 0 && (
              <span className="ml-auto text-right">注いだ時間: <strong>{totalMinutes}分</strong></span>
            )}
          </CardContent>
        </Card>
      </Hint>

      {contextMenu && onUpdate && (
        <div
          ref={contextMenuRef}
          data-context-menu
          className="fixed z-[1000] min-w-[120px] rounded-[8px] border border-[var(--glass-border)] bg-card py-1 shadow-[var(--shadow-elevated)] [backdrop-filter:blur(20px)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3.5 py-1.5 text-left text-[13px] text-foreground transition-all hover:bg-accent"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              const session = sessions.find(s => s.id === contextMenu.sessionId)
              setContextMenu(null)
              if (session) handleEditStart(session)
            }}
          >
            <EditPencil width={14} height={14} /> 編集
          </button>
        </div>
      )}

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
    </div>
  )
}
