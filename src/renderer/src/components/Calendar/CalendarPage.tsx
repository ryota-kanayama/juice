import { useCalendar } from '../../hooks/useCalendar'
import { MonthView } from './MonthView'
import { DayDetail } from './DayDetail'

export function CalendarPage() {
  const cal = useCalendar()
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-[var(--font-family)]">
      {cal.selectedDate ? (
        <DayDetail
          date={cal.selectedDate}
          sessions={cal.selectedSessions}
          onUpdate={cal.updateSession}
          onBack={() => cal.selectDate(null)}
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
    </div>
  )
}
