import { useEffect, useState } from 'react'
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { TourState } from './useTour'

export function TourOverlay({ tour }: { tour: TourState }) {
  const { refs, floatingStyles } = useFloating({
    placement: tour.step?.placement ?? 'bottom',
    middleware: [offset(10), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!tour.isActive) return
    const sel = tour.step?.target
    const el = sel ? document.querySelector<HTMLElement>(sel) : null
    refs.setReference(el)
    const update = (): void => setRect(el ? el.getBoundingClientRect() : null)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [tour.isActive, tour.index, tour.step, refs])

  if (!tour.isActive || !tour.step) return null

  return (
    // 全面を覆ってアプリ操作をブロックする（透明でもクリックを受ける）
    <div className="fixed inset-0 z-[2000]">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-md"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/50" />
      )}

      <Card
        ref={rect ? refs.setFloating : undefined}
        style={rect ? floatingStyles : undefined}
        className={`absolute z-[2001] p-3 ${
          rect ? 'w-[240px]' : 'w-[280px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
      >
        <p className="m-0 text-[13px] font-semibold text-foreground">{tour.step.title}</p>
        <p className="m-0 mt-1 text-[12px] leading-snug text-muted-foreground">{tour.step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
            {tour.index + 1} / {tour.total}
          </span>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={tour.skip}>
              スキップ
            </Button>
            {tour.index > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={tour.prev}>
                戻る
              </Button>
            )}
            {tour.isLast ? (
              <Button size="sm" className="h-7 text-[12px]" onClick={tour.finish}>
                はじめる
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-[12px]" onClick={tour.next}>
                次へ
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
