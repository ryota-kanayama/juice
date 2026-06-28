import { TimerForm } from '../components/Popover/TimerForm'
import { SessionList } from '../components/Popover/SessionList'
import { DailyDataContext } from '../daily/DailyDataContext'
import type { Session } from '../types/session'

// 並び替え永続化（IPC）を無効化する no-op の DailyData。実データに到達しない。
const NOOP_DAILY = {
  getDay: () => null,
  ensureMonth: () => {},
  setDay: async () => {},
}

const DEMO_SESSIONS: Session[] = [
  {
    id: 'demo-1',
    taskId: 'demo-1',
    name: '資料作成',
    projectCode: 'PROJ-001',
    workCategory: '設計',
    times: [{ startTime: '2026-06-28T09:00:00', endTime: '2026-06-28T10:30:00' }],
    date: '2026-06-28',
    color: '#FF9500',
    totalTime: 90,
  },
  {
    id: 'demo-2',
    taskId: 'demo-2',
    name: 'ミーティング',
    projectCode: 'PROJ-002',
    workCategory: '会議',
    times: [{ startTime: '2026-06-28T11:00:00', endTime: '2026-06-28T11:30:00' }],
    date: '2026-06-28',
    color: '#34C759',
    totalTime: 30,
  },
]

const noop = (): void => {}
const noopAsync = async (): Promise<void> => {}

// ツアー用の待機ビューデモ。実部品をダミーデータ＋全 no-op で描画し、副作用を出さない。
export function TourDemoTimer() {
  return (
    <DailyDataContext.Provider value={NOOP_DAILY}>
      <TimerForm onStart={noop} />
      <SessionList
        sessions={DEMO_SESSIONS}
        today="2026-06-28"
        isRunning={false}
        onUpdate={noopAsync}
        onStartMore={noop}
        onDelete={noop}
        onAdd={noop}
        workStart="09:00"
        workEnd={null}
        onWorkEnd={noop}
        breakStart={null}
        breakEnd={null}
        onBreakStart={noop}
        onBreakEnd={noop}
      />
    </DailyDataContext.Provider>
  )
}
