import type { ReactNode } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

interface Props {
  name: string
  /** "09:00 – 12:00"。時刻を持たない記録では undefined */
  timeRange?: string
  minutes: number
  projectCode: string
  workCategory: string
  children: ReactNode
}

/**
 * 週表示のブロックにカーソルを合わせたとき、内容を読み切れるように出す詳細。
 * 重なって幅が狭くなったブロックでも、これだけで区別できるようにする。
 */
export function BlockTooltip({ name, timeRange, minutes, projectCode, workCategory, children }: Props) {
  // Radix は TooltipContent の子要素を、視覚的な表示に加えてスクリーンリーダー用の
  // 非表示コピー（role="tooltip"）としてもう一度そのまま描画する。中身が単なる文字列
  // でなく複数要素に分かれていると、その非表示コピーが getByText の重複ヒットを生む
  // （実機でも同じ内容が2回読み上げられて冗長になる）ため、要約した aria-label を渡し
  // 非表示コピー側はそちらを使わせる。
  const summary = [name, timeRange, `${minutes}分`, projectCode, workCategory].filter(Boolean).join(' ')
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent aria-label={summary} className="max-w-[220px] px-3 py-2">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold leading-snug">{name}</span>
            <span className="flex items-center gap-2 text-[11px] opacity-90">
              {timeRange && <span>{timeRange}</span>}
              <span>{minutes}分</span>
            </span>
            {(projectCode || workCategory) && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {projectCode && (
                  <span className="rounded-full bg-background/20 px-[7px] text-[10px] leading-[1.6]">{projectCode}</span>
                )}
                {workCategory && (
                  <span className="rounded-full bg-background/20 px-[7px] text-[10px] leading-[1.6]">{workCategory}</span>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
