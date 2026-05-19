import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcChannel, IpcArg, IpcReturn, IpcEventName, IpcEventPayload,
} from '../shared/ipc'

// 型付き invoke ラッパー: IpcContract に登録のないチャンネル / 不一致な引数はコンパイルエラー
function invoke<C extends IpcChannel>(channel: C, arg: IpcArg<C>): Promise<IpcReturn<C>> {
  return ipcRenderer.invoke(channel, arg) as Promise<IpcReturn<C>>
}

// 片方向イベント（main → renderer）の購読
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

  // settings: theme / notifications / userName
  getTheme: () => invoke('settings:getTheme', undefined),
  setTheme: (themeId: string) => invoke('settings:setTheme', themeId),
  onThemeChanged: (callback: (themeId: string) => void) => on('theme-changed', callback),

  getIdleSettings: () => invoke('settings:getIdleSettings', undefined),
  setIdleSettings: (enabled: boolean, minutes: number) => invoke('settings:setIdleSettings', { enabled, minutes }),
  getElapsedSettings: () => invoke('settings:getElapsedSettings', undefined),
  setElapsedSettings: (enabled: boolean, minutes: number) => invoke('settings:setElapsedSettings', { enabled, minutes }),

  getUserName: () => invoke('settings:getUserName', undefined),
  setUserName: (userName: string) => invoke('settings:setUserName', userName),

  // settings: integrations
  getWhiteboardSettings: () => invoke('settings:getWhiteboardSettings', undefined),
  setWhiteboardSettings: (enabled: boolean, email: string) => invoke('settings:setWhiteboardSettings', { enabled, email }),
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

  // misc
  completeSetup: () => invoke('setup:complete', undefined),
  getHolidays: () => invoke('holidays:get', undefined),
  openUrl: (url: string) => invoke('shell:openUrl', url),
})
