import { useState, useEffect, useRef } from 'react'

interface ContextMenuState {
  sessionId: string
  x: number
  y: number
}

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const menu = contextMenuRef.current
    const rect = menu.getBoundingClientRect()
    const vpW = document.documentElement.clientWidth
    const vpH = document.documentElement.clientHeight
    let left = contextMenu.x
    let top = contextMenu.y
    if (left + rect.width > vpW) left = Math.max(0, vpW - rect.width)
    if (top + rect.height > vpH) top = Math.max(0, vpH - rect.height)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu) return
    const handleMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-context-menu]')) setContextMenu(null)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  return { contextMenu, setContextMenu, contextMenuRef }
}
