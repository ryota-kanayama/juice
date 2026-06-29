import { NavArrowLeft } from 'iconoir-react'
import { Button } from '@/components/ui/button'
import { UsageGuide } from './UsageGuide'

/** 使い方を本画面領域（<main>）に重ねて表示するパネル */
export function UsageGuidePanel({
  onClose,
  onStartTour,
}: {
  onClose: () => void
  onStartTour?: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      {/* ヘッダー: 戻る矢印（カレンダー詳細と同じ位置・操作感） */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" aria-label="戻る" onClick={onClose}>
          <NavArrowLeft width={18} height={18} />
        </Button>
        <span className="text-[14px] font-semibold">使い方</span>
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
              onClose()
              onStartTour()
            }}
          >
            ツアーを見る
          </Button>
        </div>
      )}
    </div>
  )
}
