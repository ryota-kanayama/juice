export interface TimeInterval {
  startTime: string
  endTime: string | null
}

export type WorkLocation = 'office' | 'telework'

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
  /** そのセッションを行った勤務場所。undefined = 出社（tw 無し）扱い。telework のときのみ保存 */
  workLocation?: WorkLocation
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
  /** 新規セッションに付ける「今の勤務場所」。切替ボタンで更新する */
  currentLocation?: WorkLocation
  /** UTC ISO8601。setDay で main 側が打刻（将来の同期での last-write-wins 用） */
  updatedAt?: string
}

/** daily-YYYY-MM.json のルート構造 */
export interface DailyMonth {
  version: number
  days: Record<string, DayRecord>
}

/** アプリ内アップデートの状態（main→renderer 共有） */
export interface UpdateInfo {
  currentVersion: string      // 例 "1.0.0"（app.getVersion()）
  latestVersion: string       // 例 "1.1.0"（タグ vX.Y.Z を正規化）
  hasUpdate: boolean          // latest が current より新しい
  releaseUrl: string          // リリースページ（フォールバックで開く）
  downloadUrl: string | null  // arch 一致 DMG の URL。無ければ null
  assetName: string | null    // 例 "Juice-1.1.0-arm64.dmg"。無ければ null
  notes: string               // リリースノート本文（未使用なら空）
}
