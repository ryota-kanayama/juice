import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getSessions: (yearMonth: string) =>
    ipcRenderer.invoke('sessions:get', yearMonth),
  saveSession: (session: unknown) =>
    ipcRenderer.invoke('sessions:save', session),
  updateSession: (session: unknown) =>
    ipcRenderer.invoke('sessions:update', session),
  openCalendar: () =>
    ipcRenderer.invoke('calendar:open'),
  resizeWindow: (width: number, height: number) =>
    ipcRenderer.invoke('window:resize', { width, height }),
  openUrl: (url: string) =>
    ipcRenderer.invoke('shell:openUrl', url),
  hideWindow: () =>
    ipcRenderer.invoke('window:hide'),
  deleteSession: (id: string, yearMonth: string) =>
    ipcRenderer.invoke('sessions:delete', { id, yearMonth }),
  getTheme: () =>
    ipcRenderer.invoke('settings:getTheme'),
  setTheme: (themeId: string) =>
    ipcRenderer.invoke('settings:setTheme', themeId),
  onThemeChanged: (callback: (themeId: string) => void) => {
    ipcRenderer.removeAllListeners('theme-changed')
    ipcRenderer.on('theme-changed', (_, themeId) => callback(themeId))
  },
  getIdleSettings: () =>
    ipcRenderer.invoke('settings:getIdleSettings'),
  setIdleSettings: (enabled: boolean, minutes: number) =>
    ipcRenderer.invoke('settings:setIdleSettings', { enabled, minutes }),
  timerStarted: () =>
    ipcRenderer.invoke('timer:started'),
  timerStopped: () =>
    ipcRenderer.invoke('timer:stopped'),
  timerAdjustStartTime: (newStartMs: number) =>
    ipcRenderer.invoke('timer:adjustStartTime', newStartMs),
  getElapsedSettings: () =>
    ipcRenderer.invoke('settings:getElapsedSettings'),
  setElapsedSettings: (enabled: boolean, minutes: number) =>
    ipcRenderer.invoke('settings:setElapsedSettings', { enabled, minutes }),
})
