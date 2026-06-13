import { BrowserWindow } from 'electron'
import { broadcastThemeOnLoad } from './themeBroadcast'
import { sharedWebPreferences, loadRenderer } from './shared'
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
    webPreferences: sharedWebPreferences,
  })

  broadcastThemeOnLoad(settingsWindow, settingsStore)
  loadRenderer(settingsWindow, 'settings')

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}
