import type { BrowserWindow } from 'electron'
import { join } from 'path'

/** 全ウィンドウ共通の webPreferences（preload パス・コンテキスト隔離設定）。 */
export const sharedWebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
} as const

/**
 * レンダラーを読み込む。dev は Vite dev サーバ、prod はバンドル済み index.html。
 * hash を渡すと該当ルート（#settings 等）を開く。
 */
export function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (process.env['NODE_ENV'] === 'development') {
    win.loadURL(`http://localhost:5174/${hash ? `#${hash}` : ''}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}
