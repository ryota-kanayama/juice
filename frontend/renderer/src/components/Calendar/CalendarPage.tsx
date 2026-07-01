import { useEffect, useState } from 'react'
import type { Session } from '../../types/session'
import { useCalendar } from '../../hooks/useCalendar'
import { useSuggestions } from '../../hooks/useSuggestions'
import { useDailyData } from '../../daily/DailyDataContext'
import { MonthView } from './MonthView'
import { DayDetail } from './DayDetail'
import { WeeklyAnalysisModal } from './WeeklyAnalysisModal'

interface Props {
  todaySessions?: Session[]
  today: string
}

export function CalendarPage({ todaySessions = [], today }: Props) {
  const cal = useCalendar()
  const suggestions = useSuggestions(todaySessions, today)
  const daily = useDailyData()
  const [analysisDate, setAnalysisDate] = useState<string | null>(null)

  const yearMonth = `${cal.year}-${String(cal.month).padStart(2, '0')}`
  useEffect(() => { daily.ensureMonth(yearMonth) }, [yearMonth, daily])

  const sessionOrder = cal.selectedDate ? (daily.getDay(cal.selectedDate)?.sessionOrder ?? null) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-[var(--font-family)]">
      {cal.selectedDate ? (
        <DayDetail
          date={cal.selectedDate}
          sessions={cal.selectedSessions}
          sessionOrder={sessionOrder}
          onUpdate={cal.updateSession}
          onBack={() => cal.selectDate(null)}
          suggestions={suggestions}
          onOpenAnalysis={() => setAnalysisDate(cal.selectedDate)}
        />
      ) : (
        <MonthView
          year={cal.year}
          month={cal.month}
          sessionDates={cal.sessionDates}
          selectedDate={cal.selectedDate}
          holidays={cal.holidays}
          onSelectDate={cal.selectDate}
          onPrevMonth={cal.prevMonth}
          onNextMonth={cal.nextMonth}
        />
      )}
      <WeeklyAnalysisModal
        date={analysisDate}
        onClose={() => setAnalysisDate(null)}
      />
    </div>
  )
}
