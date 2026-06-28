import type { RefObject } from 'react'
import type { ContextMenuState } from '../../hooks/useContextMenu'
import { EditPencil, Trash, Timer } from 'iconoir-react'

interface Props {
  menu: ContextMenuState
  menuRef: RefObject<HTMLDivElement | null>
  onAdd: () => void
  onEdit: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

const itemClass = 'flex w-full cursor-pointer items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-3 py-2 text-left text-[13px] transition-colors duration-200 hover:bg-accent'

/** セッション右クリック時のフローティングメニュー。位置補正は useContextMenu が行う。 */
export function SessionContextMenu({ menu, menuRef, onAdd, onEdit, onDelete }: Props) {
  return (
    <div
      ref={menuRef}
      data-context-menu
      className="fixed z-[1000] min-w-[120px] rounded-[8px] border border-border bg-card p-1 shadow-[var(--shadow-elevated)]"
      style={{ left: menu.x, top: menu.y }}
    >
      <button className={`${itemClass} text-foreground`} onMouseDown={e => e.preventDefault()} onClick={onAdd}>
        <Timer width={14} height={14} /> 追加
      </button>
      {menu.sessionId !== '' && (
        <>
          <button className={`${itemClass} text-foreground`} onMouseDown={e => e.preventDefault()} onClick={() => onEdit(menu.sessionId)}>
            <EditPencil width={14} height={14} /> 編集
          </button>
          <button className={`${itemClass} text-[#e74c3c]`} onMouseDown={e => e.preventDefault()} onClick={() => onDelete(menu.sessionId)}>
            <Trash width={14} height={14} /> 流す
          </button>
        </>
      )}
    </div>
  )
}
