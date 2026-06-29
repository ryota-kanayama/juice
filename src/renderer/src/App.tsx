import { useState, useEffect, useRef } from 'react'
import { TimerForm } from './components/Popover/TimerForm'
import { ActiveTimer } from './components/Popover/ActiveTimer'
import { SessionList } from './components/Popover/SessionList'
import { useSessions, type SessionsState } from './hooks/useSessions'
import { useTimerSession } from './hooks/useTimerSession'
import styles from './App.module.css'
import { AttendanceReport } from './components/Popover/AttendanceReport'
import { SettingsView } from './components/Settings/SettingsView'
import { SetupView } from './components/Setup/SetupView'
import { CalendarPage } from './components/Calendar/CalendarPage'
import { WorkStartOverlay } from './components/Popover/WorkStartOverlay'
import { UsageGuideButton } from './components/UsageGuide/UsageGuideButton'
import { useTour } from './tour/useTour'
import { TourOverlay } from './tour/TourOverlay'
import { TourDemoTimer } from './tour/TourDemoTimer'
import { useWorkday } from './hooks/useWorkday'
import { useSuggestions } from './hooks/useSuggestions'
import { useBreak } from './hooks/useBreak'
import { windowRepository } from './repositories/windowRepository'
import { User, Timer, Calendar, Xmark, OpenNewWindow, SendDiagonal } from 'iconoir-react'
import { Button } from '@/components/ui/button'
import { useAuthStatus } from './hooks/useAuthStatus'
import { DailyDataProvider } from './daily/DailyDataContext'
import { useUpdate } from './hooks/useUpdate'
import { UpdateBanner } from './components/Popover/UpdateBanner'
import { WorkLocationSwitch } from './components/Popover/WorkLocationSwitch'
import { updateRepository } from './repositories/updateRepository'

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
  return (
    <DailyDataProvider>
      <PopoverView />
    </DailyDataProvider>
  )
}

/** トリガー用のアバター。画像があれば表示し、無い・読み込み失敗時は人型アイコンにフォールバック */
function AccountAvatar({ avatarUrl, name }: { avatarUrl?: string; name?: string }) {
  const [failed, setFailed] = useState(false)
  if (avatarUrl && !failed) {
    return (
      <img
        className={styles.avatarImg}
        src={avatarUrl}
        alt={name ?? 'アカウント'}
        onError={() => setFailed(true)}
      />
    )
  }
  return <User width={16} height={16} />
}

function PopoverView() {
  const [currentPage, setCurrentPage] = useState<Page>('timer')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { status, signIn, signOut } = useAuthStatus()
  const tour = useTour()

  // ツアーのシーンを適用（指定タブへ切替）。デモ表示は tourDemo で制御する。
  useEffect(() => {
    const tab = tour.step?.scene?.tab
    if (tab) setCurrentPage(tab)
  }, [tour.index, tour.step])

  const sessions = useSessions()
  const workday = useWorkday(sessions.today)
  const update = useUpdate()

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
        <Button variant="ghost" size="icon" aria-label="閉じる" className="[-webkit-app-region:no-drag]" onClick={() => windowRepository.hide()}>
          <Xmark width={16} height={16} />
        </Button>
        <span className={styles.logo}>juice</span>
        <div className="flex items-center gap-0.5">
          <UsageGuideButton onStartTour={tour.start} />
          <div className={styles.menuWrapper} ref={menuRef}>
          <Button variant="ghost" size="icon" aria-label="アカウント" className="[-webkit-app-region:no-drag]" onClick={() => setMenuOpen(p => !p)}>
            <AccountAvatar avatarUrl={status.avatarUrl} name={status.name} />
          </Button>
          {menuOpen && (
            <div className={styles.menuPopup}>
              <div className={styles.menuAccount}>
                {status.signedIn ? (
                  <>
                    <p className={styles.menuAccountName}>{status.name}</p>
                    {status.expiresAt && (
                      <p className={styles.menuAccountMeta}>
                        有効期限: {new Date(status.expiresAt).toLocaleDateString('ja-JP')}
                      </p>
                    )}
                    <button
                      className={styles.menuAccountAction}
                      onClick={() => {
                        setMenuOpen(false)
                        signOut()
                      }}
                    >
                      サインアウト
                    </button>
                  </>
                ) : (
                  <>
                    <p className={styles.menuAccountName}>未サインイン</p>
                    <button
                      className={styles.menuAccountAction}
                      onClick={() => {
                        setMenuOpen(false)
                        signIn()
                      }}
                    >
                      Slack でサインイン
                    </button>
                  </>
                )}
              </div>
              {workday.workStart && (
                <>
                  <div className={styles.menuDivider} />
                  <WorkLocationSwitch
                    location={workday.currentLocation}
                    onSwitch={workday.switchLocation}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-muted-foreground"
                  />
                </>
              )}
              <div className={styles.menuDivider} />
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
        </div>
      </header>

      <UpdateBanner update={update} />

      {/* ページコンテンツ */}
      <main className={styles.content}>
        <div className={styles.page} style={{ display: currentPage === 'timer' ? 'flex' : 'none' }}>
          <TimerPage sessions={sessions} tourDemo={tour.isActive && tour.step?.scene?.demo === true} />
        </div>
        {currentPage === 'calendar' && <CalendarPage todaySessions={sessions.todaySessions} today={sessions.today} />}
        {currentPage === 'attendance' && (
          <div className={styles.attendanceContent}>
            <AttendanceReport sessions={sessions.todaySessions} today={sessions.today} />
          </div>
        )}
      </main>

      {/* ボトムナビゲーション */}
      <nav className="flex shrink-0 items-stretch gap-1 border-t border-border bg-card p-1">
        <button
          data-tour="tab-timer"
          onClick={() => setCurrentPage('timer')}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors ${currentPage === 'timer' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-muted-foreground hover:bg-[var(--bg-hover)]'}`}
        >
          <Timer width={18} height={18} />
          タイマー
        </button>
        <button
          data-tour="tab-calendar"
          onClick={() => setCurrentPage('calendar')}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors ${currentPage === 'calendar' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-muted-foreground hover:bg-[var(--bg-hover)]'}`}
        >
          <Calendar width={18} height={18} />
          カレンダー
        </button>
        <button
          data-tour="tab-attendance"
          onClick={() => setCurrentPage('attendance')}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors ${currentPage === 'attendance' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-muted-foreground hover:bg-[var(--bg-hover)]'}`}
        >
          <SendDiagonal width={18} height={18} />
          勤怠
        </button>
      </nav>

      <TourOverlay tour={tour} />
    </div>
  )
}

export function TimerPage({ sessions, tourDemo = false }: { sessions: SessionsState; tourDemo?: boolean }) {
  const ts = useTimerSession(sessions)

  // 更新適用直前：稼働中の区間を保存してから main へ ack を返す
  useEffect(() => {
    return updateRepository.onPrepareQuit(() => {
      void (async () => {
        if (ts.isRunning) {
          await ts.stop(ts.activeTimerProjectCode, ts.activeTimerWorkCategory).catch(() => {})
        }
        await updateRepository.readyToQuit().catch(() => {})
      })()
    })
  }, [ts])

  const workday = useWorkday(ts.today)
  const breakState = useBreak(ts, workday)
  const suggestions = useSuggestions(ts.todaySessions, ts.today)

  return (
    <div className={styles.timerPage}>
      {ts.midnightSession && (
        <div className={styles.midnightBanner}>
          <span>「{ts.midnightSession.name}」を {ts.midnightSession.date} として保存しました</span>
          <button onClick={ts.dismissMidnightSession}><Xmark width={14} height={14} /></button>
        </div>
      )}

      {ts.stopError && (
        <div className={styles.midnightBanner}>
          <span>保存に失敗しました。タイマーは継続中です。もう一度停止してください</span>
          <button onClick={ts.dismissStopError}><Xmark width={14} height={14} /></button>
        </div>
      )}

      {tourDemo ? (
        /* ツアーデモ: 副作用なしの待機ビュー */
        <div className={styles.idleContent}>
          <TourDemoTimer />
        </div>
      ) : ts.isRunning ? (
        /* 稼働時: ActiveTimerのみ */
        <div className={styles.runningLayout}>
          <ActiveTimer
            name={ts.activeTimerName}
            elapsedSeconds={ts.elapsedSeconds}
            baseSeconds={ts.baseSeconds}
            fillSeconds={ts.fillSeconds}
            color={ts.activeColor}
            initialProjectCode={ts.activeTimerProjectCode}
            initialWorkCategory={ts.activeTimerWorkCategory}
            projectCodeSuggestions={suggestions.projectCodes}
            workCategorySuggestions={suggestions.workCategories}
            onStop={ts.stop}
            onBreak={workday.breakStart === null ? () => { void breakState.handleBreakStart(ts.activeTimerProjectCode, ts.activeTimerWorkCategory) } : undefined}
            isOnBreak={breakState.isOnBreak}
          />
        </div>
      ) : !workday.workStart ? (
        /* 業務開始前: オーバーレイで覆う */
        <div className={styles.idleContent}>
          <WorkStartOverlay
            date={ts.today}
            onStart={workday.startWork}
            onTeleworkStart={ts.startTelework}
          />
        </div>
      ) : (
        /* 待機時: スクロール可能なコンテナ */
        <div className={styles.idleContent}>
          <TimerForm onStart={(name, pc, wc) => ts.start(name, pc, wc, workday.currentLocation)} nameSuggestions={suggestions.names} />
          <SessionList
            sessions={ts.todaySessions}
            today={ts.today}
            isRunning={ts.isRunning}
            onUpdate={ts.update}
            onStartMore={ts.startMore}
            onDelete={ts.remove}
            onAdjustStartTime={ms => ts.adjustStartTime(new Date(ms))}
            onAdd={(params) => ts.add(params, workday.currentLocation)}
            workStart={workday.workStart}
            workEnd={workday.workEnd}
            onWorkEnd={workday.endWork}
            breakStart={workday.breakStart}
            breakEnd={workday.breakEnd}
            onBreakStart={() => { void breakState.handleBreakStart('', '') }}
            onBreakEnd={() => { breakState.handleBreakEnd() }}
            suggestions={suggestions}
          />
        </div>
      )}
    </div>
  )
}
