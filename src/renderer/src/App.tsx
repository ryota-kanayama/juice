import { useState, useEffect, useRef } from 'react'
import { formatLocalDateTime, formatLocalDate } from '../../shared/sessionUtils'
import { TimerForm } from './components/Popover/TimerForm'
import { ActiveTimer } from './components/Popover/ActiveTimer'
import { SessionList } from './components/Popover/SessionList'
import { useTimer } from './hooks/useTimer'
import type { Session } from './types/session'
import styles from './App.module.css'
import { MonthView } from './components/Calendar/MonthView'
import { DayDetail } from './components/Calendar/DayDetail'
import { AttendanceReport } from './components/Popover/AttendanceReport'
import { SettingsView } from './components/Settings/SettingsView'

// URLハッシュでカレンダー画面かどうかを判定
function isCalendarRoute(): boolean {
  return window.location.hash === '#calendar'
}

function isSettingsRoute(): boolean {
  return window.location.hash === '#settings'
}

export default function App() {
  if (isSettingsRoute()) return <SettingsView />
  if (isCalendarRoute()) {
    return <CalendarView />
  }
  return <PopoverView />
}

function PopoverView() {
  const { isRunning, elapsedSeconds, activeColor, activeSessionId, start, startMore, stop, cancel, adjustStartTime } = useTimer()
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<'main' | 'attendance'>('main')
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeTimerName, setActiveTimerName] = useState('')
  const [activeTimerProjectCode, setActiveTimerProjectCode] = useState('')
  const [activeTimerWorkCategory, setActiveTimerWorkCategory] = useState('')
  const [todaySessions, setTodaySessions] = useState<Session[]>([])
  const [today, setToday] = useState(() => formatLocalDate(Date.now()))
  const [yearMonth, setYearMonth] = useState(() => formatLocalDate(Date.now()).slice(0, 7))
  const [midnightSession, setMidnightSession] = useState<Session | null>(null)

  // ウィンドウがフォーカスされた時に日付を更新（深夜0時を跨いだ場合のリセット）
  useEffect(() => {
    const handleFocus = () => {
      setToday(formatLocalDate(Date.now()))
      setYearMonth(formatLocalDate(Date.now()).slice(0, 7))
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // メニューが開いているとき、外側クリックで閉じる
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // 今日のセッションを読み込み
  useEffect(() => {
    window.electronAPI.getSessions(yearMonth).then(sessions => {
      setTodaySessions(sessions.filter(s => s.date === today))
    })
  }, [today, yearMonth])

  // タイマー稼働状態に合わせてウィンドウサイズを変更
  useEffect(() => {
    if (isRunning) {
      window.electronAPI.resizeWindow(580, 420)
    } else {
      window.electronAPI.resizeWindow(320, 520)
    }
  }, [isRunning])

  const handleStart = (name: string) => {
    setActiveTimerName(name)
    setActiveTimerProjectCode('')
    setActiveTimerWorkCategory('')
    start(name)
  }

  const handleStartMore = (session: Session) => {
    setActiveTimerName(session.name)
    setActiveTimerProjectCode(session.projectCode)
    setActiveTimerWorkCategory(session.workCategory)
    // 稼働中インターバルをUIに即時反映（ディスク未保存）
    const startTime = formatLocalDateTime(Date.now())
    setTodaySessions(prev => prev.map(s =>
      s.id === session.id
        ? { ...s, times: [...s.times, { startTime, endTime: null }] }
        : s
    ))
    startMore(session)
  }

  const handleStop = async (projectCode: string, workCategory: string) => {
    const session = await stop({ projectCode, workCategory })
    if (session) {
      // 日付を跨いだ場合はリストに追加せず通知バナーを表示
      if (session.date !== today) {
        setMidnightSession(session)
        return
      }
      setTodaySessions(prev => {
        const exists = prev.some(s => s.id === session.id)
        return exists
          ? prev.map(s => s.id === session.id ? session : s)
          : [...prev, session]
      })
    }
  }

  const handleUpdate = async (updatedSession: Session) => {
    // 稼働中インターバルがある場合はディスク書き込みをスキップ（stop時に正しく保存される）
    const isRunning = updatedSession.times.some(t => t.endTime === null)
    if (!isRunning) {
      await window.electronAPI.updateSession(updatedSession)
    }
    setTodaySessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s))
  }

  const handleAdjustStartTime = (newStartMs: number) => {
    adjustStartTime(new Date(newStartMs))
  }

  const handleAdd = async (params: { name: string; projectCode: string; workCategory: string; totalTime: string }) => {
    const dateStr = formatLocalDate(Date.now())
    const totalTime = Math.max(1, parseInt(params.totalTime, 10))
    const JUICE_COLORS = ['#FF6B6B', '#FF9500', '#F7B731', '#e17055', '#fd79a8', '#a29bfe', '#45aaf2', '#0984e3', '#26de81', '#00b894']
    const id = crypto.randomUUID()
    const session: Session = {
      id,
      taskId: id,
      name: params.name,
      projectCode: params.projectCode,
      workCategory: params.workCategory,
      times: [],
      date: dateStr,
      color: JUICE_COLORS[Math.floor(Math.random() * JUICE_COLORS.length)],
      totalTime,
    }
    await window.electronAPI.updateSession(session)
    setTodaySessions(prev => [...prev, session])
  }

  const handleDelete = async (sessionId: string) => {
    if (sessionId === activeSessionId) {
      cancel()
    }
    const session = todaySessions.find(s => s.id === sessionId)
    if (session) {
      await window.electronAPI.deleteSession(sessionId, session.date.slice(0, 7))
    }
    setTodaySessions(prev => prev.filter(s => s.id !== sessionId))
  }

  const handleOpenCalendar = () => {
    setMenuOpen(false)
    window.electronAPI.openCalendar()
    window.electronAPI.hideWindow()
  }

  const handleOpenAttendance = () => {
    setMenuOpen(false)
    window.electronAPI.openUrl('https://attendance.jsl.co.jp/')
  }

  const handleClose = () => {
    window.electronAPI.hideWindow()
  }

  return (
    <div className={styles.popover}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.closeButton} onClick={handleClose}>×</button>
          <span className={styles.logo}>🧃 Juice</span>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.menuWrapper} ref={menuRef}>
            <button
              className={styles.menuButton}
              onClick={() => setMenuOpen(prev => !prev)}
            >
              ☰
            </button>
            {menuOpen && (
              <div className={styles.menuPopup}>
                <button className={styles.menuItem} onClick={handleOpenAttendance}>
                  JSL ↗
                </button>
                <button className={styles.menuItem} onClick={handleOpenCalendar}>
                  カレンダー ↗
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => { setMenuOpen(false); setView('attendance') }}
                >
                  ジュースを提供する
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {midnightSession && (
        <div className={styles.midnightBanner}>
          <span>「{midnightSession.name}」を {midnightSession.date} として保存しました</span>
          <button onClick={() => setMidnightSession(null)}>✕</button>
        </div>
      )}

      {isRunning ? (
        /* 稼働時: 横並びレイアウト */
        <div className={styles.runningLayout}>
          <div className={styles.leftPanel}>
            <ActiveTimer
              name={activeTimerName}
              elapsedSeconds={elapsedSeconds}
              color={activeColor}
              initialProjectCode={activeTimerProjectCode}
              initialWorkCategory={activeTimerWorkCategory}
              onStop={handleStop}
            />
          </div>
          <div className={styles.rightPanel}>
            <SessionList
              sessions={todaySessions}
              isRunning={isRunning}
              onUpdate={handleUpdate}
              onStartMore={handleStartMore}
              onDelete={handleDelete}
              onAdjustStartTime={handleAdjustStartTime}
            onAdd={handleAdd}
            />
          </div>
        </div>
      ) : view === 'attendance' ? (
        /* 勤怠報告画面 */
        <div className={styles.idleContent}>
          <AttendanceReport
            sessions={todaySessions}
            onBack={() => setView('main')}
          />
        </div>
      ) : (
        /* 待機時: スクロール可能なコンテナ */
        <div className={styles.idleContent}>
          <TimerForm onStart={handleStart} />
          <SessionList
            sessions={todaySessions}
            isRunning={isRunning}
            onUpdate={handleUpdate}
            onStartMore={handleStartMore}
            onDelete={handleDelete}
            onAdjustStartTime={handleAdjustStartTime}
            onAdd={handleAdd}
          />
        </div>
      )}
    </div>
  )
}

function CalendarView() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session[]>>({})

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  useEffect(() => {
    window.electronAPI.getSessions(yearMonth).then(sessions => {
      const grouped: Record<string, Session[]> = {}
      for (const s of sessions) {
        if (!grouped[s.date]) grouped[s.date] = []
        grouped[s.date].push(s)
      }
      setSessionsByDate(grouped)
    })
  }, [yearMonth])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  const handleUpdateSession = async (updated: Session) => {
    await window.electronAPI.updateSession(updated)
    setSessionsByDate(prev => ({
      ...prev,
      [updated.date]: prev[updated.date]?.map(s => s.id === updated.id ? updated : s) ?? prev[updated.date],
    }))
  }

  const sessionDates = Object.keys(sessionsByDate)
  const selectedSessions = selectedDate ? (sessionsByDate[selectedDate] ?? []) : []

  return (
    <div className={styles.calendarLayout}>
      <div className={styles.calendarLeft}>
        <MonthView
          year={year}
          month={month}
          sessionDates={sessionDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
        />
      </div>
      <div className={styles.calendarRight}>
        <DayDetail date={selectedDate} sessions={selectedSessions} onUpdate={handleUpdateSession} />
      </div>
    </div>
  )
}
