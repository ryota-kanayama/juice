/// <reference types="vite/client" />

import type { Session } from '../../shared/types'
import type {
  AttendanceSendResult, AuthStatus, PomodoroSettings, SlackSettings, ToggleSettings, WhiteboardSettings,
} from '../../shared/ipc'

// preload が contextBridge 経由でレンダラーに公開する API。
// IPC チャンネル契約は src/shared/ipc.ts の IpcContract を参照。
interface ElectronAPI {
  // sessions
  getSessions: (yearMonth: string) => Promise<Session[]>
  saveSession: (session: Session) => Promise<void>
  updateSession: (session: Session) => Promise<void>
  deleteSession: (id: string, yearMonth: string) => Promise<void>

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
  getSlackSettings: () => Promise<SlackSettings>
  setSlackSettings: (projectCode: string, projectName: string) => Promise<void>

  // timer signals
  timerStarted: () => Promise<void>
  timerStopped: () => Promise<void>
  timerAdjustStartTime: (newStartMs: number) => Promise<void>

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

  // misc
  completeSetup: () => Promise<void>
  getHolidays: () => Promise<Record<string, string>>
  openUrl: (url: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
