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
import { SetupView } from './components/Setup/SetupView'
import { Menu, Timer, Calendar, Xmark, OpenNewWindow, SendDiagonal } from 'iconoir-react'

type Page = 'timer' | 'calendar' | 'attendance'

function isSetupRoute(): boolean {
  return window.location.hash === '#setup'
}

function isSettingsRoute(): boolean {
  return window.location.hash === '#settings'
}

export default function App() {
  if (isSetupRoute()) return <SetupView />
  if (isSettingsRoute()) return <SettingsView />

  const [currentPage, setCurrentPage] = useState<Page>('timer')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className={styles.app}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <span className={styles.logo}>Juice</span>
        <div className={styles.headerActions}>
          <div className={styles.menuWrapper} ref={menuRef}>
            <button className={styles.menuButton} onClick={() => setMenuOpen(p => !p)}>
              <Menu width={16} height={16} />
            </button>
            {menuOpen && (
              <div className={styles.menuPopup}>
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    setMenuOpen(false)
                    window.electronAPI.openUrl('https://attendance.jsl.co.jp/')
                  }}
                >
                  JSL <OpenNewWindow width={12} height={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ページコンテンツ */}
      <main className={styles.content}>
        <div className={styles.page} style={{ display: currentPage === 'timer' ? 'flex' : 'none' }}>
          <TimerPage />
        </div>
        {currentPage === 'calendar' && <CalendarPage />}
        {currentPage === 'attendance' && <AttendancePage />}
      </main>

      {/* ボトムナビゲーション */}
      <nav className={styles.tabBar}>
        <button
          className={`${styles.tabItem} ${currentPage === 'timer' ? styles.tabActive : ''}`}
          onClick={() => setCurrentPage('timer')}
        >
          <Timer width={18} height={18} />
          <span className={styles.tabLabel}>タイマー</span>
        </button>
        <button
          className={`${styles.tabItem} ${currentPage === 'calendar' ? styles.tabActive : ''}`}
          onClick={() => setCurrentPage('calendar')}
        >
          <Calendar width={18} height={18} />
          <span className={styles.tabLabel}>カレンダー</span>
        </button>
        <button
          className={`${styles.tabItem} ${currentPage === 'attendance' ? styles.tabActive : ''}`}
          onClick={() => setCurrentPage('attendance')}
        >
          <SendDiagonal width={18} height={18} />
          <span className={styles.tabLabel}>勤怠</span>
        </button>
      </nav>
    </div>
  )
}

function TimerPage() {
  const { isRunning, elapsedSeconds, activeColor, activeSessionId, start, startMore, stop, cancel, adjustStartTime } = useTimer()
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

  // 今日のセッションを読み込み
  useEffect(() => {
    window.electronAPI.getSessions(yearMonth).then(sessions => {
      setTodaySessions(sessions.filter(s => s.date === today))
    })
  }, [today, yearMonth])

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

  return (
    <div className={styles.timerPage}>
      {midnightSession && (
        <div className={styles.midnightBanner}>
          <span>「{midnightSession.name}」を {midnightSession.date} として保存しました</span>
          <button onClick={() => setMidnightSession(null)}><Xmark width={14} height={14} /></button>
        </div>
      )}

      {isRunning ? (
        /* 稼働時: ActiveTimerのみ */
        <div className={styles.runningLayout}>
          <ActiveTimer
            name={activeTimerName}
            elapsedSeconds={elapsedSeconds}
            color={activeColor}
            initialProjectCode={activeTimerProjectCode}
            initialWorkCategory={activeTimerWorkCategory}
            onStop={handleStop}
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

function CalendarPage() {
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

function AttendancePage() {
  const [todaySessions, setTodaySessions] = useState<Session[]>([])
  const today = formatLocalDate(Date.now())
  const yearMonth = today.slice(0, 7)

  useEffect(() => {
    window.electronAPI.getSessions(yearMonth).then(sessions => {
      setTodaySessions(sessions.filter(s => s.date === today))
    })
  }, [today, yearMonth])

  return (
    <div className={styles.idleContent}>
      <AttendanceReport sessions={todaySessions} />
    </div>
  )
}
