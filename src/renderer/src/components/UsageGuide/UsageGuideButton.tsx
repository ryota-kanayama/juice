import { useState } from 'react'
import { HelpCircle, NavArrowLeft } from 'iconoir-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { UsageGuide } from './UsageGuide'

export function UsageGuideButton({ onStartTour }: { onStartTour?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="使い方"
        data-tour="help"
        className="[-webkit-app-region:no-drag]"
        onClick={() => setOpen(true)}
      >
        <HelpCircle width={16} height={16} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* 不透明フルスクリーンの1画面として切り替える（背景を透けさせない） */}
        <DialogContent
          className="inset-0 z-[200] flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 [&>button]:hidden"
          aria-describedby={undefined}
        >
          {/* ヘッダー: 戻る矢印（カレンダー詳細と同じ位置・操作感） */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
            <Button variant="ghost" size="icon" aria-label="戻る" onClick={() => setOpen(false)}>
              <NavArrowLeft width={18} height={18} />
            </Button>
            <DialogTitle className="text-[14px] font-semibold">使い方</DialogTitle>
          </div>

          {/* カルーセル（1項目ずつ） */}
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <UsageGuide />
          </div>

          {/* 下部: ツアー再生 */}
          {onStartTour && (
            <div className="shrink-0 border-t border-border p-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setOpen(false)
                  onStartTour()
                }}
              >
                ツアーを見る
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
