import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  year: number
  month: number  // 1-12
  sessionDates: string[]  // "YYYY-MM-DD" の配列（記録がある日）
  selectedDate: string | null
  holidays: Record<string, string>  // "YYYY-MM-DD" => 祝日名
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

export function MonthView({
  year, month, sessionDates, selectedDate, holidays,
  onSelectDate, onPrevMonth, onNextMonth
}: Props) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()  // 0=日曜

  const pad = (n: number) => String(n).padStart(2, '0')

  // 空セルで週の始まりを合わせる
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const sessionDateSet = new Set(sessionDates)

  // 曜日見出し(auto) + 週の行(均等)で残り高さを埋める
  const numWeekRows = Math.ceil(cells.length / 7)

  return (
    <Card className="flex flex-1 flex-col select-none p-3">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onPrevMonth} aria-label="前月"><NavArrowLeft width={18} height={18} /></Button>
        <span className="text-base font-bold text-[var(--text-primary)]">{year}年 {month}月</span>
        <Button variant="ghost" size="icon" onClick={onNextMonth} aria-label="次月"><NavArrowRight width={18} height={18} /></Button>
      </div>

      <div
        className="grid flex-1 grid-cols-7 gap-[3px]"
        style={{ gridTemplateRows: `auto repeat(${numWeekRows}, minmax(0, 1fr))` }}
        role="grid"
      >
        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
          <div
            key={d}
            className={`py-1 text-center text-[11px] font-medium ${i === 0 ? 'text-[#e74c3c]' : i === 6 ? 'text-[#3498db]' : 'text-[var(--text-muted)]'}`}
            role="columnheader"
          >{d}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} role="gridcell" />
          }
          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const hasSession = sessionDateSet.has(dateStr)
          const isSelected = selectedDate === dateStr
          const dayOfWeek = new Date(year, month - 1, day).getDay()
          const isSunday = dayOfWeek === 0
          const isSaturday = dayOfWeek === 6
          const isHoliday = dateStr in holidays
          const textColor = isSelected
            ? 'text-white'
            : (isSunday || isHoliday)
              ? 'text-[#e74c3c]'
              : isSaturday
                ? 'text-[#3498db]'
                : 'text-[var(--text-primary)]'
          return (
            <button
              key={dateStr}
              className={[
                'relative flex h-full min-h-[32px] cursor-pointer items-center justify-center rounded-[6px] border-0 text-[13px] leading-none transition-all',
                hasSession ? 'font-semibold' : '',
                isSelected
                  ? 'bg-[image:var(--gradient-accent)] shadow-[0_4px_12px_var(--accent-light)]'
                  : 'bg-transparent hover:bg-[var(--accent-light)]',
                textColor,
              ].filter(Boolean).join(' ')}
              title={isHoliday ? holidays[dateStr] : undefined}
              onClick={() => onSelectDate(dateStr)}
              aria-pressed={isSelected}
              aria-label={`${month}月${day}日${hasSession ? '（記録あり）' : ''}`}
            >
              {day}
              {hasSession && <span className={`absolute top-[calc(50%+8px)] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isSelected ? 'bg-white' : 'bg-[var(--accent)]'}`} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
