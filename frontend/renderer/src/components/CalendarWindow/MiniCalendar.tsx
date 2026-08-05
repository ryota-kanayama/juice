import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { Button } from '@/components/ui/button'
import { weekDates } from '../../domain/calendarRange'

interface Props {
  /** 表示する月の基準日 "YYYY-MM-DD" */
  anchorDate: string
  selectedDate: string
  /** 記録がある日の集合 */
  sessionDates: Set<string>
  holidays: Record<string, string>
  /** 帯でハイライトする週（週表示のときだけ渡す） */
  highlightWeekOf?: string
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function MiniCalendar({
  anchorDate, selectedDate, sessionDates, holidays, highlightWeekOf,
  onSelectDate, onPrevMonth, onNextMonth,
}: Props) {
  const [year, month] = anchorDate.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  const weekSet = new Set(highlightWeekOf ? weekDates(highlightWeekOf) : [])

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-center gap-1">
        <span className="flex-1 text-[12px] font-bold text-[var(--text-primary)]">{year}年{month}月</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPrevMonth} aria-label="前月">
          <NavArrowLeft width={14} height={14} />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNextMonth} aria-label="次月">
          <NavArrowRight width={14} height={14} />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[9px] text-[var(--text-muted)]">
        {WEEKDAYS.map(d => <div key={d} className="py-0.5">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[10px]">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />
          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const isSelected = dateStr === selectedDate
          const inWeek = weekSet.has(dateStr)
          const isHoliday = dateStr in holidays
          const dow = new Date(year, month - 1, day).getDay()
          const textColor = isSelected
            ? 'text-[var(--text-on-accent)]'
            : (dow === 0 || isHoliday)
              ? 'text-[#e74c3c]'
              : dow === 6
                ? 'text-[#3498db]'
                : 'text-[var(--text-primary)]'
          return (
            <button
              key={dateStr}
              className={[
                'relative cursor-pointer rounded-full border-0 py-[3px] transition-colors',
                isSelected
                  ? 'bg-[var(--accent)] font-bold'
                  : inWeek
                    ? 'bg-[var(--accent-light)]'
                    : 'bg-transparent hover:bg-[var(--bg-hover)]',
                textColor,
              ].join(' ')}
              onClick={() => onSelectDate(dateStr)}
              aria-pressed={isSelected}
              aria-label={`${month}月${day}日`}
              {...(inWeek ? { 'data-in-week': dateStr } : {})}
              {...(isHoliday ? { 'data-holiday': dateStr } : {})}
            >
              {day}
              {sessionDates.has(dateStr) && (
                <span
                  data-session-dot={dateStr}
                  className={`absolute bottom-px left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full ${isSelected ? 'bg-[var(--text-on-accent)]' : 'bg-[var(--accent)]'}`}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
