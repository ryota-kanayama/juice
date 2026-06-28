import type { DragEvent, MouseEvent } from 'react'
import type { Session } from '../../types/session'
import { resolveJuiceColor } from '../../domain/colors'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Play } from 'iconoir-react'

interface Props {
  session: Session
  isRunning?: boolean
  expanded: boolean
  dragOver: boolean
  onStartMore?: (session: Session) => void
  onToggleExpand: () => void
  onEditStart: () => void
  onContextMenu: (e: MouseEvent) => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDragEnd: () => void
}

// クリック/ダブルクリックを行全体で拾うが、内部のボタン・入力・リストボックス上では無視する
const isInteractiveTarget = (e: MouseEvent): boolean =>
  Boolean((e.target as HTMLElement).closest('button, input, [role="listbox"]'))

/** セッションリストの1行。展開状態・ドラッグ状態の見た目と、行ごとの操作を担う。 */
export function SessionItem({
  session, isRunning, expanded, dragOver, onStartMore,
  onToggleExpand, onEditStart, onContextMenu,
  onDragStart, onDragOver, onDragLeave, onDragEnd,
}: Props) {
  return (
    <TooltipProvider delayDuration={450}>
      <Tooltip>
        <TooltipTrigger asChild>
          <li
            data-session-item
            draggable
            className={`group flex cursor-grab items-start gap-2 rounded-[8px] border bg-card px-2.5 py-2 transition-all duration-200 hover:bg-accent active:cursor-grabbing ${expanded ? 'bg-accent' : ''} ${dragOver ? 'border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-light)]' : 'border-border'}`}
            onClick={e => { if (!isInteractiveTarget(e)) onToggleExpand() }}
            onDoubleClick={e => { if (!isInteractiveTarget(e)) onEditStart() }}
            onContextMenu={onContextMenu}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDragEnd={onDragEnd}
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
        </TooltipTrigger>
        <TooltipContent>ダブルクリックで編集・右クリックで操作</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
