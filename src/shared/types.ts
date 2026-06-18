export interface TimeInterval {
  startTime: string
  endTime: string | null
}

export interface Session {
  id: string
  taskId: string
  name: string
  projectCode: string
  workCategory: string
  times: TimeInterval[]
  date: string
  color: string
  totalTime: number
}

export interface SessionFile {
  sessions: Session[]
}

/** 日付ごとの勤務関連データ（workStart/workEnd/telework/sessionOrder） */
export interface DayRecord {
  workStart?: string
  workEnd?: string
  breakStart?: string | null
  breakEnd?: string | null
  breakMinutes?: number
  telework?: boolean
  sessionOrder?: string[]
  /** UTC ISO8601。setDay で main 側が打刻（将来の同期での last-write-wins 用） */
  updatedAt?: string
}

/** daily-YYYY-MM.json のルート構造 */
export interface DailyMonth {
  version: number
  days: Record<string, DayRecord>
}
