import { BrowserWindow } from 'electron'
import type { SettingsStore } from '../settingsStore'

/** ウィンドウ読み込み完了時に保存済みテーマを適用する */
export function broadcastThemeOnLoad(win: BrowserWindow, settingsStore: SettingsStore): void {
  win.webContents.on('did-finish-load', async () => {
    const themeId = await settingsStore.getTheme()
    win.webContents.send('theme-changed', themeId)
  })
}

/** 全ウィンドウにテーマ変更を通知する */
export function broadcastThemeToAll(themeId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('theme-changed', themeId)
  }
}
