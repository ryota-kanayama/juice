import { app, BrowserWindow, screen } from 'electron'
import { broadcastThemeOnLoad } from './themeBroadcast'
import { sharedWebPreferences, loadRenderer } from './shared'
import type { SettingsStore } from '../settingsStore'

let setupWindow: BrowserWindow | null = null

export function getSetupWindow(): BrowserWindow | null {
  return setupWindow
}

export function createSetupWindow(settingsStore: SettingsStore): void {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const winW = 440
  const winH = 400

  setupWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round((screenH - winH) / 2),
    resizable: false,
    title: 'Juice — セットアップ',
    webPreferences: sharedWebPreferences,
  })

  broadcastThemeOnLoad(setupWindow, settingsStore)
  loadRenderer(setupWindow, 'setup')

  setupWindow.on('closed', async () => {
    setupWindow = null
    // セットアップ未完了でウィンドウを閉じた場合はアプリ終了。
    // isSetupCompleted は Promise を返すため await しないと常に truthy 判定になる。
    if (!(await settingsStore.isSetupCompleted())) {
      app.quit()
    }
  })
}
