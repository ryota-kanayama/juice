import { useCalendar } from '../../hooks/useCalendar'
import { MonthView } from './MonthView'
import { DayDetail } from './DayDetail'
import styles from '../../App.module.css'

export function CalendarPage() {
  const cal = useCalendar()
  return (
    <div className={styles.calendarLayout}>
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
