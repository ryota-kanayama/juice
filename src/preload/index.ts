import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcChannel, IpcArg, IpcReturn, IpcEventName, IpcEventPayload, AuthStatus,
} from '../shared/ipc'
import type { DayRecord } from '../shared/types'

// 型付き invoke ラッパー: IpcContract に登録のないチャンネル / 不一致な引数はコンパイルエラー
function invoke<C extends IpcChannel>(channel: C, arg: IpcArg<C>): Promise<IpcReturn<C>> {
  return ipcRenderer.invoke(channel, arg) as Promise<IpcReturn<C>>
}

// 片方向イベント（main → renderer）の購読。
// リスナーを1つずつ登録し、解除関数を返す。複数コンポーネントからの購読が可能で、
// 各購読者は unmount 時に自分のリスナーだけを解除できる。
function on<E extends IpcEventName>(event: E, callback: (payload: IpcEventPayload<E>) => void): () => void {
  const listener = (_: unknown, payload: IpcEventPayload<E>): void => callback(payload)
  ipcRenderer.on(event, listener)
  return () => { ipcRenderer.removeListener(event, listener) }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // sessions
  getSessions: (yearMonth: string) => invoke('sessions:get', yearMonth),
  saveSession: (session) => invoke('sessions:save', session),
  updateSession: (session) => invoke('sessions:update', session),
  deleteSession: (id: string, yearMonth: string) => invoke('sessions:delete', { id, yearMonth }),

  // daily（日次勤務データ）
  getDailyMonth: (yearMonth: string) => invoke('daily:getMonth', yearMonth),
  setDailyDay: (date: string, patch: DayRecord) => invoke('daily:setDay', { date, patch }),
  pruneDaily: (keepDays: number) => invoke('daily:prune', { keepDays }),
  importLegacyDaily: (entries: Array<{ date: string; record: DayRecord }>) =>
    invoke('daily:importLegacy', { entries }),

  // settings: theme / notifications
  getTheme: () => invoke('settings:getTheme', undefined),
  setTheme: (themeId: string) => invoke('settings:setTheme', themeId),
  onThemeChanged: (callback: (themeId: string) => void) => on('theme-changed', callback),

  getIdleSettings: () => invoke('settings:getIdleSettings', undefined),
  setIdleSettings: (enabled: boolean, minutes: number) => invoke('settings:setIdleSettings', { enabled, minutes }),
  getElapsedSettings: () => invoke('settings:getElapsedSettings', undefined),
  setElapsedSettings: (enabled: boolean, minutes: number) => invoke('settings:setElapsedSettings', { enabled, minutes }),
  getPomodoroSettings: () => invoke('settings:getPomodoroSettings', undefined),
  setPomodoroSettings: (enabled: boolean) => invoke('settings:setPomodoroSettings', { enabled }),

  // settings: integrations
  getWhiteboardSettings: () => invoke('settings:getWhiteboardSettings', undefined),
  setWhiteboardSettings: (enabled: boolean) => invoke('settings:setWhiteboardSettings', { enabled }),
  getLaunchAtLogin: () => invoke('settings:getLaunchAtLogin', undefined),
  setLaunchAtLogin: (enabled: boolean) => invoke('settings:setLaunchAtLogin', enabled),
  getBreakBehaviorSettings: () => invoke('settings:getBreakBehaviorSettings', undefined),
  setBreakBehaviorSettings: (behavior: 'stop' | 'pause') => invoke('settings:setBreakBehaviorSettings', { behavior }),
  getMainProjectCode: () => invoke('settings:getMainProjectCode', undefined),
  setMainProjectCode: (code: string) => invoke('settings:setMainProjectCode', code),

  // timer signals
  timerStarted: () => invoke('timer:started', undefined),
  timerStopped: () => invoke('timer:stopped', undefined),
  timerAdjustStartTime: (newStartMs: number) => invoke('timer:adjustStartTime', newStartMs),

  // attendance
  sendAttendance: (text: string) => invoke('attendance:send', text),
  teleworkStart: () => invoke('whiteboard:teleworkStart', undefined),

  // window
  hideWindow: () => invoke('window:hide', undefined),
  resizeWindow: (width: number, height: number) => invoke('window:resize', { width, height }),

  // auth
  signInWithSlack: () => invoke('auth:start', undefined),
  getAuthStatus: () => invoke('auth:getStatus', undefined),
  signOutSlack: () => invoke('auth:signOut', undefined),
  onAuthChanged: (callback: (status: AuthStatus) => void) => on('auth-changed', callback),

  // misc
  completeSetup: () => invoke('setup:complete', undefined),
  getHolidays: () => invoke('holidays:get', undefined),
  openUrl: (url: string) => invoke('shell:openUrl', url),
})
