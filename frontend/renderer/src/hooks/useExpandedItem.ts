import { useState, useEffect } from 'react'

export function useExpandedItem() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!expandedId) return
    const handleMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-session-item]')) setExpandedId(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [expandedId])

  return { expandedId, setExpandedId }
}
