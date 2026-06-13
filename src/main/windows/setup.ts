import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { broadcastThemeOnLoad } from './themeBroadcast'
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  broadcastThemeOnLoad(setupWindow, settingsStore)

  if (process.env['NODE_ENV'] === 'development') {
    setupWindow.loadURL('http://localhost:5174/#setup')
  } else {
    setupWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'setup' })
  }

  setupWindow.on('closed', async () => {
    setupWindow = null
    // セットアップ未完了でウィンドウを閉じた場合はアプリ終了。
    // isSetupCompleted は Promise を返すため await しないと常に truthy 判定になる。
    if (!(await settingsStore.isSetupCompleted())) {
      app.quit()
    }
  })
}
