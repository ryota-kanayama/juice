import { useState } from 'react'
import { HelpCircle } from 'iconoir-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
        <DialogContent className="max-w-[300px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>使い方</DialogTitle>
          </DialogHeader>
          <UsageGuide />
        </DialogContent>
      </Dialog>
    </>
  )
}
