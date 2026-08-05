import { useEffect, useMemo, useState } from 'react'
import { useCalendarWindow } from '../../hooks/useCalendarWindow'
import { useSuggestions } from '../../hooks/useSuggestions'
import { useDailyData } from '../../daily/DailyDataContext'
import { formatPeriod } from '../../domain/calendarRange'
import { MiniCalendar } from './MiniCalendar'
import { CalendarToolbar } from './CalendarToolbar'
import { WeekGrid } from './WeekGrid'
import { MonthGrid } from './MonthGrid'
import { DayDetail } from '../Calendar/DayDetail'
import { WeeklyAnalysisModal } from '../Calendar/WeeklyAnalysisModal'

/** カレンダー専用ウィンドウのルート。左サイドバー（ミニカレンダー + 選択日詳細）と
 *  メイン領域（週 / 月グリッド）の2ペイン構成。 */
export function CalendarWindow() {
  const cal = useCalendarWindow()
  const daily = useDailyData()
  const [analysisDate, setAnalysisDate] = useState<string | null>(null)

  const selectedSessions = cal.sessionsByDate[cal.selectedDate] ?? []
  const suggestions = useSuggestions(selectedSessions, cal.selectedDate)

  const yearMonth = cal.selectedDate.slice(0, 7)
  useEffect(() => { daily.ensureMonth(yearMonth) }, [yearMonth, daily])

  const sessionDates = useMemo(
    () => new Set(Object.keys(cal.sessionsByDate).filter(d => (cal.sessionsByDate[d]?.length ?? 0) > 0)),
    [cal.sessionsByDate],
  )
  const periodLabel = formatPeriod(cal.visibleDates)
  const sessionOrder = daily.getDay(cal.selectedDate)?.sessionOrder ?? null

  return (
    <div className="flex h-screen w-full bg-[var(--bg)] font-[var(--font-family)] antialiased">
      {/* 左サイドバー */}
      <aside className="flex w-[220px] shrink-0 flex-col gap-3 overflow-hidden border-r border-[var(--glass-border)] p-3">
        <MiniCalendar
          anchorDate={cal.anchorDate}
          selectedDate={cal.selectedDate}
          sessionDates={sessionDates}
          holidays={cal.holidays}
          highlightWeekOf={cal.view === 'week' ? cal.anchorDate : undefined}
          onSelectDate={cal.selectDate}
          onPrevMonth={cal.goPrevMonth}
          onNextMonth={cal.goNextMonth}
        />
        <div className="border-t border-[var(--glass-border)]" />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DayDetail
            date={cal.selectedDate}
            sessions={selectedSessions}
            sessionOrder={sessionOrder}
            onUpdate={cal.updateSession}
            suggestions={suggestions}
            onOpenAnalysis={() => setAnalysisDate(cal.selectedDate)}
          />
        </div>
      </aside>

      {/* メイン領域 */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-3">
        <CalendarToolbar
          view={cal.view}
          periodLabel={periodLabel}
          onToday={cal.goToday}
          onPrev={cal.goPrev}
          onNext={cal.goNext}
          onChangeView={cal.setView}
        />
        {cal.view === 'week' ? (
          <WeekGrid
            dates={cal.visibleDates}
            sessionsByDate={cal.sessionsByDate}
            selectedDate={cal.selectedDate}
            holidays={cal.holidays}
            onSelectDate={cal.selectDate}
          />
        ) : (
          <MonthGrid
            anchorDate={cal.anchorDate}
            sessionsByDate={cal.sessionsByDate}
            selectedDate={cal.selectedDate}
            holidays={cal.holidays}
            onSelectDate={cal.selectDate}
          />
        )}
      </main>

      <WeeklyAnalysisModal date={analysisDate} onClose={() => setAnalysisDate(null)} />
    </div>
  )
}
