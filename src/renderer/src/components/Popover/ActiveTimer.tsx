import { useState } from 'react'
import { SuggestInput } from '@/components/ui/suggest-input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { resolveJuiceColor } from '../../domain/colors'

interface Props {
  name: string
  elapsedSeconds: number
  /** 延長時に引き継ぐ累計秒。表示にのみ加算され、水位アニメーションには影響しない */
  baseSeconds?: number
  /** 水位が100%になるまでの秒数。デフォルトは25分（1500秒） */
  fillSeconds?: number
  color: string
  initialProjectCode?: string
  initialWorkCategory?: string
  projectCodeSuggestions?: string[]
  workCategorySuggestions?: string[]
  onStop: (projectCode: string, workCategory: string) => void
}

// fillSeconds で満杯（最大100%）。デフォルトは25分
const DEFAULT_FILL_SECONDS = 1500

function juiceLevel(seconds: number, fillSeconds: number): number {
  if (fillSeconds <= 0) return 0
  return Math.min((seconds / fillSeconds) * 100, 100)
}

export function ActiveTimer({ name, elapsedSeconds, baseSeconds = 0, fillSeconds = DEFAULT_FILL_SECONDS, color, initialProjectCode, initialWorkCategory, projectCodeSuggestions = [], workCategorySuggestions = [], onStop }: Props) {
  const [projectCode, setProjectCode] = useState(initialProjectCode ?? '')
  const [workCategory, setWorkCategory] = useState(initialWorkCategory ?? '')
  const resolvedColor = resolveJuiceColor(color)
  const level = juiceLevel(elapsedSeconds, fillSeconds)
  // 液面の y 座標（0=満杯/上端、120=空/下端）。
  // 山の高さを不均一にした 1 周期(=120px, 30px幅の山4つ)を 3 つ並べて x=-120..240 を埋め、
  // 下端(120)まで閉じて塗りつぶす。横スクロール(-120px)で 1 周期ぶんシームレスにループ。
  const surfaceY = (100 - level) * 1.2
  const WAVE_HEIGHTS = [-3, -6, 4, -5] // 各 30px 区間の山の高さ（負=上）。幅広め
  const period = WAVE_HEIGHTS.map(h => `q15,${h} 30,0`).join(' ')
  // 底は 200 まで塗る（左右に傾けても円の下端に隙間が出ないよう余裕を持たせる）
  const wavePath = `M-120,${surfaceY} ${period} ${period} ${period} L240,200 L-120,200 Z`

  return (
    <Card className="flex flex-1 w-full flex-col justify-center overflow-hidden rounded-xl bg-[var(--glass-bg)] shadow-[var(--shadow-glass)] [backdrop-filter:blur(var(--glass-blur))] [-webkit-backdrop-filter:blur(var(--glass-blur))]">
      {/* メインビジュアル */}
      <div className="flex flex-col items-center gap-2.5 px-4 pb-4 pt-7">
        <p className="m-0 text-base font-bold text-[var(--text-primary)]">{name}</p>
        <p className="m-0 text-[11px] tracking-[0.05em] text-[var(--text-muted)]">ジュースを注いでいます</p>

        {/* 円形波アニメーション */}
        <div className="flex items-center justify-center py-2" aria-hidden="true">
          <div className="relative h-[120px] w-[120px] overflow-hidden rounded-full border-2" style={{ borderColor: resolvedColor }}>
            {/* ジュース本体 + 上昇する泡（マスクで泡の形にジュースを打ち抜き背景を透過） */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 120 120" aria-hidden="true">
              <defs>
                <mask id="juice-bubble-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
                  {/* 白=表示、黒=打ち抜き（泡の穴） */}
                  <rect x="0" y="0" width="120" height="120" fill="white" />
                  <circle className="animate-bubble-rise-1" cx="35" cy="0" r="4" fill="black" />
                  <circle className="animate-bubble-rise-2" cx="75" cy="0" r="3" fill="black" />
                  <circle className="animate-bubble-rise-3" cx="55" cy="0" r="2.5" fill="black" />
                </mask>
              </defs>
              <g mask="url(#juice-bubble-mask)">
                {/* 外側 g で中心まわりに左右へ傾けて揺らし（スロッシュ）、内側 g で横スクロール */}
                <g className="animate-slosh" style={{ transformBox: 'view-box', transformOrigin: '60px 60px' }}>
                  <g className="animate-wave-shift">
                    <path data-testid="juice-level" d={wavePath} style={{ fill: resolvedColor }} />
                  </g>
                </g>
              </g>
            </svg>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold leading-[1.2] text-[var(--text-primary)]">
              {Math.floor((baseSeconds + elapsedSeconds) / 60)}分経過
            </span>
          </div>
        </div>
      </div>

      {/* コントロール */}
      <div className="flex flex-col items-center gap-2.5 border-t border-[var(--glass-border)] px-4 pb-4 pt-3">
        <div className="flex w-full gap-1.5">
          <SuggestInput
            value={projectCode}
            onChange={e => setProjectCode(e.target.value)}
            options={projectCodeSuggestions.map(v => ({ value: v }))}
            onSelectOption={o => setProjectCode(o.value)}
            placeholder="PJコード"
            aria-label="PJコード"
            autoFocus
            dropUp
          />
          <SuggestInput
            value={workCategory}
            onChange={e => setWorkCategory(e.target.value)}
            options={workCategorySuggestions.map(v => ({ value: v }))}
            onSelectOption={o => setWorkCategory(o.value)}
            placeholder="作業区分"
            aria-label="作業区分"
            dropUp
          />
        </div>

        <Button variant="outline" size="lg" onClick={() => onStop(projectCode, workCategory)}>
          やめる
        </Button>
      </div>
    </Card>
  )
}
