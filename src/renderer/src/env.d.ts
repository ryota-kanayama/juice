/// <reference types="vite/client" />

import type { Session, DailyMonth, DayRecord, UpdateInfo } from '../../shared/types'
import type {
  AttendanceSendResult, AuthStatus, BreakBehaviorSettings, PomodoroSettings, ToggleSettings, WhiteboardSettings,
} from '../../shared/ipc'

// preload が contextBridge 経由でレンダラーに公開する API。
// IPC チャンネル契約は src/shared/ipc.ts の IpcContract を参照。
interface ElectronAPI {
  // sessions
  getSessions: (yearMonth: string) => Promise<Session[]>
  saveSession: (session: Session) => Promise<void>
  updateSession: (session: Session) => Promise<void>
  deleteSession: (id: string, yearMonth: string) => Promise<void>

  // daily（日次勤務データ）
  getDailyMonth: (yearMonth: string) => Promise<DailyMonth>
  setDailyDay: (date: string, patch: DayRecord) => Promise<void>
  pruneDaily: (keepDays: number) => Promise<void>
  importLegacyDaily: (entries: Array<{ date: string; record: DayRecord }>) => Promise<void>

  // settings: theme / notifications
  getTheme: () => Promise<string>
  setTheme: (themeId: string) => Promise<void>
  onThemeChanged: (callback: (themeId: string) => void) => () => void
  getIdleSettings: () => Promise<ToggleSettings>
  setIdleSettings: (enabled: boolean, minutes: number) => Promise<void>
  getElapsedSettings: () => Promise<ToggleSettings>
  setElapsedSettings: (enabled: boolean, minutes: number) => Promise<void>
  getPomodoroSettings: () => Promise<PomodoroSettings>
  setPomodoroSettings: (enabled: boolean) => Promise<void>

  // settings: integrations
  getWhiteboardSettings: () => Promise<WhiteboardSettings>
  setWhiteboardSettings: (enabled: boolean) => Promise<void>
  getBreakBehaviorSettings: () => Promise<BreakBehaviorSettings>
  setBreakBehaviorSettings: (behavior: 'stop' | 'pause') => Promise<void>
  getLaunchAtLogin: () => Promise<boolean>
  setLaunchAtLogin: (enabled: boolean) => Promise<void>
  getMainProjectCode: () => Promise<string>
  setMainProjectCode: (code: string) => Promise<void>

  // timer signals
  timerStarted: () => Promise<void>
  timerStopped: () => Promise<void>
  timerAdjustStartTime: (newStartMs: number) => Promise<void>
  isTimerRunning: () => Promise<boolean>

  // attendance
  sendAttendance: (text: string) => Promise<AttendanceSendResult>
  teleworkStart: () => Promise<void>

  // window
  hideWindow: () => Promise<void>
  resizeWindow: (width: number, height: number) => Promise<void>

  // auth
  signInWithSlack: () => Promise<void>
  getAuthStatus: () => Promise<AuthStatus>
  signOutSlack: () => Promise<void>
  onAuthChanged: (callback: (status: AuthStatus) => void) => () => void

  // update
  checkForUpdate: () => Promise<UpdateInfo>
  downloadUpdate: () => Promise<void>
  restartForUpdate: () => Promise<void>
  dismissUpdate: (version: string) => Promise<void>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateProgress: (callback: (p: { percent: number; done: boolean; error?: string }) => void) => () => void
  onUpdateInstalled: (callback: (p: { version: string }) => void) => () => void

  // misc
  completeSetup: () => Promise<void>
  getHolidays: () => Promise<Record<string, string>>
  openUrl: (url: string) => Promise<void>
  getAppVersion: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
