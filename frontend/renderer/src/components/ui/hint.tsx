import type { ReactElement } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

interface Props {
  /** 吹き出しに出す文言。undefined のときはツールチップを付けず子をそのまま返す。 */
  label?: string
  /** 吹き出しを出す向き。既定は Radix の "top"。窓の最上部の要素などは "bottom" にする。 */
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}

/**
 * ネイティブ `title=` の代わりに使う shadcn(Radix) ツールチップの薄いラッパ。
 * `<Hint label="編集"><button>…</button></Hint>` のように使う。
 */
export function Hint({ label, side, children }: Props) {
  if (!label) return children
  return (
    <TooltipProvider delayDuration={450}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
