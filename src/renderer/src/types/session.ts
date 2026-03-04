// 共有型定義（src/shared/types.ts が正とする。sessionStore.ts と同期不要）
import type { Session } from '../../../shared/types'
export type { TimeInterval, Session, SessionFile } from '../../../shared/types'

// IPC通信で使う型
export interface ElectronAPI {
  getSessions: (yearMonth: string) => Promise<Session[]>
  saveSession: (session: Session) => Promise<void>
  updateSession: (session: Session) => Promise<void>
  openCalendar: () => Promise<void>
  resizeWindow: (width: number, height: number) => Promise<void>
  openUrl: (url: string) => Promise<void>
  hideWindow: () => Promise<void>
  deleteSession: (id: string, yearMonth: string) => Promise<void>
  getTheme: () => Promise<string>
  setTheme: (themeId: string) => Promise<void>
  onThemeChanged: (callback: (themeId: string) => void) => void
  getIdleSettings: () => Promise<{ enabled: boolean; minutes: number }>
  setIdleSettings: (enabled: boolean, minutes: number) => Promise<void>
  timerStarted: () => Promise<void>
  timerStopped: () => Promise<void>
  timerAdjustStartTime: (newStartMs: number) => Promise<void>
  getElapsedSettings: () => Promise<{ enabled: boolean; minutes: number }>
  setElapsedSettings: (enabled: boolean, minutes: number) => Promise<void>
  getUserName: () => Promise<string>
  setUserName: (userName: string) => Promise<void>
  sendAttendance: (text: string) => Promise<{ ok: boolean; status: number; body: string }>
  getWhiteboardSettings: () => Promise<{ enabled: boolean; email: string }>
  setWhiteboardSettings: (enabled: boolean, email: string) => Promise<void>
  completeSetup: () => Promise<void>
}
