import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface Props {
  name: string
  elapsedSeconds: number
  color: string
  initialProjectCode?: string
  initialWorkCategory?: string
  onStop: (projectCode: string, workCategory: string) => void
}

// 15分で満杯（最大100%）
function juiceLevel(seconds: number): number {
  return Math.min((seconds / 900) * 100, 100)
}

export function ActiveTimer({ name, elapsedSeconds, color, initialProjectCode, initialWorkCategory, onStop }: Props) {
  const [projectCode, setProjectCode] = useState(initialProjectCode ?? '')
  const [workCategory, setWorkCategory] = useState(initialWorkCategory ?? '')
  const level = juiceLevel(elapsedSeconds)

  return (
    <Card className="flex flex-1 w-full flex-col justify-center overflow-hidden rounded-xl bg-[var(--glass-bg)] shadow-[var(--shadow-glass)] [backdrop-filter:blur(var(--glass-blur))] [-webkit-backdrop-filter:blur(var(--glass-blur))]">
      {/* メインビジュアル */}
      <div className="flex flex-col items-center gap-2.5 px-4 pb-4 pt-7">
        <p className="m-0 text-base font-bold text-[var(--text-primary)]">{name}</p>
        <p className="m-0 text-[11px] tracking-[0.05em] text-[var(--text-muted)]">ジュースを注いでいます</p>

        {/* 円形波アニメーション */}
        <div className="flex items-center justify-center py-2" aria-hidden="true">
          <div className="relative h-[120px] w-[120px] overflow-hidden rounded-full border-2" style={{ borderColor: color }}>
            {/* 泡 — 線のみの円 */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 120 120" style={{ clipPath: `inset(calc(${100 - level}% + 20px) 0 0 0)` }}>
              <circle className="animate-bubble-rise-1" cx="35" cy="0" r="4" fill="none" stroke={color} strokeWidth="1.5" />
              <circle className="animate-bubble-rise-2" cx="75" cy="0" r="3" fill="none" stroke={color} strokeWidth="1.5" />
              <circle className="animate-bubble-rise-3" cx="55" cy="0" r="2.5" fill="none" stroke={color} strokeWidth="1" />
            </svg>
            {/* 波線 */}
            <svg
              className="absolute left-0 h-5 w-[300%] animate-wave-shift transition-[top] duration-1000 ease-linear"
              data-testid="juice-level"
              style={{ top: `${100 - level}%` }}
              viewBox="0 0 900 20"
              preserveAspectRatio="none"
            >
              <path
                className="[vector-effect:non-scaling-stroke]"
                d="M0,10 q150,10 300,0 t300,0 q150,10 300,0"
                fill="none"
                stroke={color}
                strokeWidth="2"
              />
            </svg>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold leading-[1.2] text-[var(--text-primary)]">
              {Math.floor(elapsedSeconds / 60)}分経過
            </span>
          </div>
        </div>
      </div>

      {/* コントロール */}
      <div className="flex flex-col items-center gap-2.5 border-t border-[var(--glass-border)] px-4 pb-4 pt-3">
        <div className="flex w-full gap-1.5">
          <Input
            value={projectCode}
            onChange={e => setProjectCode(e.target.value)}
            placeholder="PJコード"
            aria-label="PJコード"
            autoFocus
          />
          <Input
            value={workCategory}
            onChange={e => setWorkCategory(e.target.value)}
            placeholder="作業区分"
            aria-label="作業区分"
          />
        </div>

        <Button variant="outline" size="lg" onClick={() => onStop(projectCode, workCategory)}>
          やめる
        </Button>
      </div>
    </Card>
  )
}
