import { useEffect, useState, type CSSProperties } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { TourStep } from './tourSteps'
import type { TourState } from './useTour'

const BUBBLE_W = 260
const GAP = 10
const EDGE = 8

// 対象矩形から吹き出しの位置を同期的に決める（floating-ui を使わず 0,0 への一瞬の
// 表示＝左上飛びを原理的に防ぐ）。固定サイズの小窓・既知ターゲット向けの簡易配置。
function computeBubbleStyle(rect: DOMRect, placement: NonNullable<TourStep['placement']>): CSSProperties {
  const viewportW = window.innerWidth
  const cx = rect.left + rect.width / 2
  // 水平方向は対象の中央に寄せつつ、画面端からはみ出さないようクランプする
  const left = Math.max(EDGE, Math.min(cx - BUBBLE_W / 2, viewportW - BUBBLE_W - EDGE))

  if (placement === 'top') {
    return { left, top: rect.top - GAP, transform: 'translateY(-100%)', width: BUBBLE_W }
  }
  if (placement === 'left') {
    return { left: rect.left - GAP, top: rect.top + rect.height / 2, transform: 'translate(-100%, -50%)', width: BUBBLE_W }
  }
  if (placement === 'right') {
    return { left: rect.right + GAP, top: rect.top + rect.height / 2, transform: 'translateY(-50%)', width: BUBBLE_W }
  }
  // bottom（既定）
  return { left, top: rect.bottom + GAP, width: BUBBLE_W }
}

export function TourOverlay({ tour }: { tour: TourState }) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!tour.isActive) {
      setRect(null)
      return
    }
    const sel = tour.step?.target
    let raf = 0
    let tries = 0
    // タブ切替直後など対象がまだ DOM に無い場合は数フレーム待って再取得する
    const update = (): void => {
      const el = sel ? document.querySelector<HTMLElement>(sel) : null
      if (sel && !el && tries < 10) {
        tries++
        raf = requestAnimationFrame(update)
        return
      }
      setRect(el ? el.getBoundingClientRect() : null)
    }
    update()
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
    }
  }, [tour.isActive, tour.index, tour.step])

  if (!tour.isActive || !tour.step) return null

  const placement = tour.step.placement ?? 'bottom'

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
        style={rect ? computeBubbleStyle(rect, placement) : undefined}
        className={`absolute z-[2001] p-4 ${
          rect ? '' : 'w-[300px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
      >
        <p className="m-0 text-[14px] font-semibold text-foreground">{tour.step.title}</p>
        <p className="m-0 mt-1 text-[13px] leading-snug text-muted-foreground">{tour.step.body}</p>
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
