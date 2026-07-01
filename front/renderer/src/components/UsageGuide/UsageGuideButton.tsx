import { HelpCircle } from 'iconoir-react'
import { Button } from '@/components/ui/button'

/** ヘッダーの「使い方」ボタン。押下で onOpen を呼ぶだけ（パネル本体は別） */
export function UsageGuideButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="使い方"
      data-tour="help"
      className="[-webkit-app-region:no-drag]"
      onClick={onOpen}
    >
      <HelpCircle width={16} height={16} />
    </Button>
  )
}
