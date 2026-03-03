import styles from './MonthView.module.css'

interface Props {
  year: number
  month: number  // 1-12
  sessionDates: string[]  // "YYYY-MM-DD" の配列（記録がある日）
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

export function MonthView({
  year, month, sessionDates, selectedDate,
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

  return (
    <div className={styles.container}>
      <div className={styles.navigation}>
        <button onClick={onPrevMonth} aria-label="←">←</button>
        <span className={styles.title}>{year}年 {month}月</span>
        <button onClick={onNextMonth} aria-label="→">→</button>
      </div>

      <div className={styles.grid} role="grid">
        {['日', '月', '火', '水', '木', '金', '土'].map(d => (
          <div key={d} className={styles.weekday} role="columnheader">{d}</div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} role="gridcell" />
          }
          const dateStr = `${year}-${pad(month)}-${pad(day)}`
          const hasSession = sessionDateSet.has(dateStr)
          const isSelected = selectedDate === dateStr
          return (
            <button
              key={dateStr}
              className={[
                styles.day,
                hasSession ? styles.hasSession : '',
                isSelected ? styles.selected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDate(dateStr)}
              aria-pressed={isSelected}
              aria-label={`${month}月${day}日${hasSession ? '（記録あり）' : ''}`}
            >
              {day}
              {hasSession && <span className={styles.dot} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
