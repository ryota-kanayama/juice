import { useState } from 'react'
import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { Button } from '@/components/ui/button'

interface GuideItem {
  title: string
  description: string
}

const GUIDE_ITEMS: GuideItem[] = [
  { title: '作業を始める', description: '作業名を入力して「注ぐ」を押すと計測を開始します。' },
  { title: '記録を編集', description: '一覧の項目をダブルクリックすると編集できます。' },
  { title: '追加・削除', description: '一覧を右クリックしてメニューから追加・削除します。' },
  { title: '並び替え', description: '項目をドラッグすると順序を入れ替えられます。' },
  { title: '休憩・終了', description: 'カード下部のボタンで休憩や業務終了を記録します。' },
  { title: '勤怠を調整', description: '勤怠タブで出勤・退勤・休憩の時刻をダブルクリックして編集します。' },
  { title: '共有', description: '勤怠タブの「コピー」「送る」でチームに共有します。' },
]

export function UsageGuide() {
  const [index, setIndex] = useState(0)
  const item = GUIDE_ITEMS[index]
  const isFirst = index === 0
  const isLast = index === GUIDE_ITEMS.length - 1

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex w-full items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="前の項目へ"
          disabled={isFirst}
          onClick={() => setIndex(i => Math.max(0, i - 1))}
        >
          <NavArrowLeft width={18} height={18} />
        </Button>
        <div className="flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 px-1 text-center">
          <span className="text-[14px] font-semibold text-foreground">{item.title}</span>
          <span className="text-[12px] leading-snug text-muted-foreground">{item.description}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="次の項目へ"
          disabled={isLast}
          onClick={() => setIndex(i => Math.min(GUIDE_ITEMS.length - 1, i + 1))}
        >
          <NavArrowRight width={18} height={18} />
        </Button>
      </div>
      <div className="flex gap-1.5">
        {GUIDE_ITEMS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-all ${
              i === index ? 'bg-[var(--accent)]' : 'bg-[var(--glass-border)]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
