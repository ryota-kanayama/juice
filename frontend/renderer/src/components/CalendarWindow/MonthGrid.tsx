import type { Session } from '../../types/session'
import { resolveJuiceColor } from '../../domain/colors'

interface Props {
  /** 表示する月の基準日 "YYYY-MM-DD" */
  anchorDate: string
  sessionsByDate: Record<string, Session[]>
  selectedDate: string
  holidays: Record<string, string>
  onSelectDate: (date: string) => void
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
/** セルに直接出すチップの最大数。超過分は「他N件」にまとめる。 */
const MAX_CHIPS = 3
/** カレンダーは常に6週(42セル)固定。月初/月末の空白は前後月の日付で埋める。 */
const WEEK_ROWS = 6
const GRID_CELLS = WEEK_ROWS * 7

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface Cell {
  date: Date
  dateStr: string
  day: number
  /** 表示中の月に属するセルか（前後月のセルは薄く表示する）。 */
  inCurrentMonth: boolean
}

export function MonthGrid({ anchorDate, sessionsByDate, selectedDate, holidays, onSelectDate }: Props) {
  const [year, month] = anchorDate.split('-').map(Number)
  const firstOfMonth = new Date(year, month - 1, 1)
  const gridStart = new Date(year, month - 1, 1 - firstOfMonth.getDay())

  const cells: Cell[] = Array.from({ length: GRID_CELLS }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return {
      date: d,
      dateStr: toDateStr(d),
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === month - 1 && d.getFullYear() === year,
    }
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-7 rounded-t-[6px] border border-b-0 border-[var(--glass-border)] bg-card">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={`border-r border-[var(--glass-border)] py-1.5 text-center text-[11px] last:border-r-0 ${i === 0 ? 'text-[#e74c3c]' : i === 6 ? 'text-[#3498db]' : 'text-[var(--text-muted)]'}`}
          >{d}</div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-7 rounded-b-[6px] border border-[var(--glass-border)]"
        style={{ gridTemplateRows: `repeat(${WEEK_ROWS}, minmax(0, 1fr))` }}
      >
        {cells.map(cell => {
          const { dateStr, day, inCurrentMonth } = cell
          const sessions = sessionsByDate[dateStr] ?? []
          const isSelected = dateStr === selectedDate
          const isHoliday = dateStr in holidays
          const dow = cell.date.getDay()
          const cellMonth = cell.date.getMonth() + 1
          const dayColor = (dow === 0 || isHoliday)
            ? 'text-[#e74c3c]'
            : dow === 6
              ? 'text-[#3498db]'
              : 'text-[var(--text-primary)]'
          return (
            <button
              key={dateStr}
              className={`flex cursor-pointer flex-col items-stretch gap-0.5 overflow-hidden border-0 border-b border-r border-[var(--glass-border)] p-1 text-left transition-colors ${isSelected ? 'bg-[var(--accent-light)]' : 'bg-transparent hover:bg-[var(--bg-hover)]'}`}
              onClick={() => onSelectDate(dateStr)}
              aria-pressed={isSelected}
              aria-label={`${cellMonth}月${day}日${sessions.length > 0 ? '（記録あり）' : ''}`}
              {...(isHoliday ? { 'data-holiday': dateStr } : {})}
              {...(!inCurrentMonth ? { 'data-outside-month': dateStr } : {})}
            >
              <span className={`text-[11px] leading-none ${isSelected ? 'font-bold' : ''} ${dayColor} ${inCurrentMonth ? '' : 'opacity-40'}`}>{day}</span>
              {sessions.slice(0, MAX_CHIPS).map(s => (
                <span
                  key={s.id}
                  className="flex items-center gap-1 overflow-hidden rounded-[3px] px-1 py-px text-[9px] leading-tight text-white"
                  style={{ background: resolveJuiceColor(s.color) }}
                  title={`${s.name} ${s.totalTime}分`}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto shrink-0 opacity-85">{s.totalTime}分</span>
                </span>
              ))}
              {sessions.length > MAX_CHIPS && (
                <span className="px-1 text-[9px] text-[var(--text-muted)]">他{sessions.length - MAX_CHIPS}件</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
