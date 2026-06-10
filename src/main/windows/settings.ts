import { BrowserWindow } from 'electron'
import { join } from 'path'
import { broadcastThemeOnLoad } from './themeBroadcast'
import type { SettingsStore } from '../settingsStore'

let settingsWindow: BrowserWindow | null = null

export function createSettingsWindow(settingsStore: SettingsStore): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 500,
    resizable: false,
    title: 'Juice 設定',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  broadcastThemeOnLoad(settingsWindow, settingsStore)

  if (process.env['NODE_ENV'] === 'development') {
    settingsWindow.loadURL('http://localhost:5174/#settings')
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'settings' })
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}
