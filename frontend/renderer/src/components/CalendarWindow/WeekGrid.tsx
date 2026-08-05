import type { Session } from '../../types/session'
import { resolveJuiceColor } from '../../domain/colors'

interface Props {
  /** 日曜〜土曜の7日 "YYYY-MM-DD" */
  dates: string[]
  sessionsByDate: Record<string, Session[]>
  selectedDate: string
  holidays: Record<string, string>
  onSelectDate: (date: string) => void
}

/** グリッドの表示範囲（時）と1時間あたりの高さ(px)。 */
const START_HOUR = 8
const END_HOUR = 20
const HOUR_PX = 44
const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_PX

const WEEKDAYS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日']

/** "YYYY-MM-DDTHH:mm:ss" を、その日の 0:00 からの経過分に変換する。 */
function minutesOfDay(localDateTime: string): number {
  const time = localDateTime.split('T')[1] ?? '00:00:00'
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

interface Block {
  key: string
  name: string
  color: string
  top: number
  height: number
  label: string
}

/** 1日ぶんの区間を、グリッド座標のブロックに変換する（範囲外はクリップ、稼働中は除外）。 */
function toBlocks(sessions: Session[]): Block[] {
  const blocks: Block[] = []
  for (const s of sessions) {
    s.times.forEach((t, i) => {
      if (!t.endTime) return
      const startMin = minutesOfDay(t.startTime)
      const endMin = minutesOfDay(t.endTime)
      const clippedStart = Math.max(startMin, START_HOUR * 60)
      const clippedEnd = Math.min(endMin, END_HOUR * 60)
      if (clippedEnd <= clippedStart) return
      blocks.push({
        key: `${s.id}-${i}`,
        name: s.name,
        color: resolveJuiceColor(s.color),
        top: ((clippedStart - START_HOUR * 60) / 60) * HOUR_PX,
        height: ((clippedEnd - clippedStart) / 60) * HOUR_PX,
        label: `${t.startTime.split('T')[1].slice(0, 5)}–${t.endTime.split('T')[1].slice(0, 5)}`,
      })
    })
  }
  return blocks
}

export function WeekGrid({ dates, sessionsByDate, selectedDate, holidays, onSelectDate }: Props) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const cols = `44px repeat(7, minmax(0, 1fr))`

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      {/* 曜日ヘッダー */}
      <div
        className="sticky top-0 z-10 grid shrink-0 rounded-t-[6px] border border-b-0 border-[var(--glass-border)] bg-card"
        style={{ gridTemplateColumns: cols }}
      >
        <div className="border-r border-[var(--glass-border)]" />
        {dates.map((date, i) => {
          const day = Number(date.slice(8, 10))
          const month = Number(date.slice(5, 7))
          const isSelected = date === selectedDate
          const isHoliday = date in holidays
          const color = (i === 0 || isHoliday) ? 'text-[#e74c3c]' : i === 6 ? 'text-[#3498db]' : 'text-[var(--text-muted)]'
          return (
            <button
              key={date}
              className={`cursor-pointer border-0 border-r border-[var(--glass-border)] py-1.5 text-center text-[11px] transition-colors last:border-r-0 ${isSelected ? 'bg-[var(--accent-light)] font-bold' : 'bg-transparent hover:bg-[var(--bg-hover)]'} ${color}`}
              onClick={() => onSelectDate(date)}
              aria-label={`${month}月${day}日 ${WEEKDAYS[i]}`}
              aria-pressed={isSelected}
            >
              {WEEKDAYS[i].charAt(0)} {day}
            </button>
          )
        })}
      </div>

      {/* 時間軸グリッド */}
      <div
        className="grid shrink-0 rounded-b-[6px] border border-[var(--glass-border)]"
        style={{ gridTemplateColumns: cols }}
      >
        {/* 時刻ガター */}
        <div className="relative border-r border-[var(--glass-border)]" style={{ height: GRID_HEIGHT }}>
          {hours.slice(1).map((h, i) => (
            <span
              key={h}
              className="absolute right-1 -translate-y-1/2 text-[9px] text-[var(--text-muted)]"
              style={{ top: (i + 1) * HOUR_PX }}
            >{h}:00</span>
          ))}
        </div>

        {dates.map((date, i) => {
          const isSelected = date === selectedDate
          const isHoliday = date in holidays
          const tint = (i === 0 || isHoliday)
            ? 'rgba(231,76,60,.04)'
            : i === 6
              ? 'rgba(52,152,219,.04)'
              : 'transparent'
          return (
            <div
              key={date}
              className="relative border-r border-[var(--glass-border)] last:border-r-0"
              style={{
                height: GRID_HEIGHT,
                background: `${isSelected ? 'var(--accent-light)' : tint} repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--glass-border) ${HOUR_PX - 1}px, var(--glass-border) ${HOUR_PX}px)`,
              }}
              {...(isSelected ? { 'data-selected': date } : {})}
            >
              {toBlocks(sessionsByDate[date] ?? []).map(b => (
                <div
                  key={b.key}
                  data-event-block
                  className="absolute left-0.5 right-0.5 overflow-hidden rounded-[3px] px-1 py-0.5 text-[9px] leading-tight text-white shadow-sm"
                  style={{ top: `${b.top}px`, height: `${b.height}px`, background: b.color }}
                  title={`${b.name} ${b.label}`}
                >
                  <div className="truncate font-semibold">{b.name}</div>
                  <div className="truncate opacity-85">{b.label}</div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
