import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcChannel, IpcArg, IpcReturn, IpcEventName, IpcEventPayload, AuthStatus,
} from '../shared/ipc'

// 型付き invoke ラッパー: IpcContract に登録のないチャンネル / 不一致な引数はコンパイルエラー
function invoke<C extends IpcChannel>(channel: C, arg: IpcArg<C>): Promise<IpcReturn<C>> {
  return ipcRenderer.invoke(channel, arg) as Promise<IpcReturn<C>>
}

// 片方向イベント（main → renderer）の購読。
// 注意: removeAllListeners で上書きするため 1 チャンネルにつき購読者は 1 つ。
// 複数コンポーネントから同一イベントを購読する場合は off 方式への変更が必要。
function on<E extends IpcEventName>(event: E, callback: (payload: IpcEventPayload<E>) => void): void {
  ipcRenderer.removeAllListeners(event)
  ipcRenderer.on(event, (_, payload: IpcEventPayload<E>) => callback(payload))
}

contextBridge.exposeInMainWorld('electronAPI', {
  // sessions
  getSessions: (yearMonth: string) => invoke('sessions:get', yearMonth),
  saveSession: (session) => invoke('sessions:save', session),
  updateSession: (session) => invoke('sessions:update', session),
  deleteSession: (id: string, yearMonth: string) => invoke('sessions:delete', { id, yearMonth }),

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
  getSlackSettings: () => invoke('settings:getSlackSettings', undefined),
  setSlackSettings: (projectCode: string, projectName: string) => invoke('settings:setSlackSettings', { projectCode, projectName }),

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
