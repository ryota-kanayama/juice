import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { Button } from '@/components/ui/button'
import type { CalendarView } from '../../hooks/useCalendarWindow'

interface Props {
  view: CalendarView
  /** 期間見出し（formatPeriod の結果） */
  periodLabel: string
  onToday: () => void
  onPrev: () => void
  onNext: () => void
  onChangeView: (v: CalendarView) => void
  /** 選択日の週次分析を開く */
  onOpenAnalysis?: () => void
}

export function CalendarToolbar({ view, periodLabel, onToday, onPrev, onNext, onChangeView, onOpenAnalysis }: Props) {
  return (
    <div className="mb-2 flex shrink-0 items-center gap-2 border-b border-[var(--glass-border)] pb-1.5">
      <Button variant="outline" size="sm" onClick={onToday}>今日</Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev} aria-label="前へ">
        <NavArrowLeft width={16} height={16} />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} aria-label="次へ">
        <NavArrowRight width={16} height={16} />
      </Button>
      <strong className="text-[14px] font-bold text-[var(--text-primary)]">{periodLabel}</strong>
      <span className="flex-1" />
      {onOpenAnalysis && (
        <Button variant="outline" size="sm" onClick={onOpenAnalysis}>週次分析</Button>
      )}
      <Button
        variant={view === 'month' ? 'default' : 'ghost'}
        size="sm"
        aria-pressed={view === 'month'}
        onClick={() => onChangeView('month')}
      >月</Button>
      <Button
        variant={view === 'week' ? 'default' : 'ghost'}
        size="sm"
        aria-pressed={view === 'week'}
        onClick={() => onChangeView('week')}
      >週</Button>
    </div>
  )
}
