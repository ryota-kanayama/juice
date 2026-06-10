import { useState, useEffect, useRef } from 'react'
import { TimerForm } from './components/Popover/TimerForm'
import { ActiveTimer } from './components/Popover/ActiveTimer'
import { SessionList } from './components/Popover/SessionList'
import { useTimer } from './hooks/useTimer'
import { useSessions, type SessionsState } from './hooks/useSessions'
import type { Session } from './types/session'
import styles from './App.module.css'
import { AttendanceReport } from './components/Popover/AttendanceReport'
import { SettingsView } from './components/Settings/SettingsView'
import { SetupView } from './components/Setup/SetupView'
import { CalendarPage } from './components/Calendar/CalendarPage'
import { windowRepository } from './repositories/windowRepository'
import { Menu, Timer, Calendar, Xmark, OpenNewWindow, SendDiagonal } from 'iconoir-react'
import { Button } from '@/components/ui/button'

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
  return <PopoverView />
}

function PopoverView() {
  const [currentPage, setCurrentPage] = useState<Page>('timer')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const sessions = useSessions()

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className={styles.app}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <Button variant="ghost" size="icon" aria-label="閉じる" onClick={() => windowRepository.hide()}>
          <Xmark width={16} height={16} />
        </Button>
        <span className={styles.logo}>juice</span>
        <div className={styles.menuWrapper} ref={menuRef}>
          <Button variant="ghost" size="icon" aria-label="メニュー" onClick={() => setMenuOpen(p => !p)}>
            <Menu width={16} height={16} />
          </Button>
          {menuOpen && (
            <div className={styles.menuPopup}>
              <button
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false)
                  windowRepository.openUrl('https://attendance.jsl.co.jp/')
                }}
              >
                JSL <OpenNewWindow width={12} height={12} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ページコンテンツ */}
      <main className={styles.content}>
        <div className={styles.page} style={{ display: currentPage === 'timer' ? 'flex' : 'none' }}>
          <TimerPage sessions={sessions} />
        </div>
        {currentPage === 'calendar' && <CalendarPage />}
        {currentPage === 'attendance' && (
          <div className={styles.attendanceContent}>
            <AttendanceReport sessions={sessions.todaySessions} />
          </div>
        )}
      </main>

      {/* ボトムナビゲーション */}
      <nav className="flex shrink-0 items-stretch gap-1 border-t border-border bg-card p-1">
        <button
          onClick={() => setCurrentPage('timer')}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors ${currentPage === 'timer' ? 'bg-accent text-[var(--accent)]' : 'text-muted-foreground hover:bg-accent/50'}`}
        >
          <Timer width={18} height={18} />
          タイマー
        </button>
        <button
          onClick={() => setCurrentPage('calendar')}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors ${currentPage === 'calendar' ? 'bg-accent text-[var(--accent)]' : 'text-muted-foreground hover:bg-accent/50'}`}
        >
          <Calendar width={18} height={18} />
          カレンダー
        </button>
        <button
          onClick={() => setCurrentPage('attendance')}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors ${currentPage === 'attendance' ? 'bg-accent text-[var(--accent)]' : 'text-muted-foreground hover:bg-accent/50'}`}
        >
          <SendDiagonal width={18} height={18} />
          勤怠
        </button>
      </nav>
    </div>
  )
}

function TimerPage({ sessions }: { sessions: SessionsState }) {
  const { isRunning, elapsedSeconds, activeColor, activeSessionId, start, startMore, stop, cancel, adjustStartTime } = useTimer()
  const [activeTimerName, setActiveTimerName] = useState('')
  const [activeTimerProjectCode, setActiveTimerProjectCode] = useState('')
  const [activeTimerWorkCategory, setActiveTimerWorkCategory] = useState('')
  const [midnightSession, setMidnightSession] = useState<Session | null>(null)

  const handleStart = (name: string): void => {
    setActiveTimerName(name)
    setActiveTimerProjectCode('')
    setActiveTimerWorkCategory('')
    start(name)
  }

  const handleStartMore = (session: Session): void => {
    setActiveTimerName(session.name)
    setActiveTimerProjectCode(session.projectCode)
    setActiveTimerWorkCategory(session.workCategory)
    sessions.applyStartMore(session)
    startMore(session)
  }

  const handleStop = async (projectCode: string, workCategory: string): Promise<void> => {
    const result = await stop({ projectCode, workCategory })
    if (!result) return
    // 日付を跨いだ場合はリストに追加せず通知バナーを表示
    if (result.date !== sessions.today) {
      setMidnightSession(result)
      return
    }
    sessions.upsertToday(result)
  }

  const handleDelete = async (sessionId: string): Promise<void> => {
    if (sessionId === activeSessionId) cancel()
    await sessions.remove(sessionId)
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
            sessions={sessions.todaySessions}
            today={sessions.today}
            isRunning={isRunning}
            onUpdate={sessions.update}
            onStartMore={handleStartMore}
            onDelete={handleDelete}
            onAdjustStartTime={ms => adjustStartTime(new Date(ms))}
            onAdd={sessions.add}
            onTeleworkStart={sessions.startTelework}
          />
        </div>
      )}
    </div>
  )
}
