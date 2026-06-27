import { useState } from 'react'
import { HelpCircle } from 'iconoir-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { UsageGuide } from './UsageGuide'

export function UsageGuideButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="使い方"
        className="[-webkit-app-region:no-drag]"
        onClick={() => setOpen(true)}
      >
        <HelpCircle width={16} height={16} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* パネル（内側カード）を見せ、上下矢印はその外に置くため枠を透明化する */}
        <DialogContent
          className="max-w-[240px] gap-0 border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">使い方</DialogTitle>
          <UsageGuide />
        </DialogContent>
      </Dialog>
    </>
  )
}
