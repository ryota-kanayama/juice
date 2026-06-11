import { BrowserWindow } from 'electron'
import type { AuthStatus } from '../../shared/ipc'

/** 全ウィンドウに auth-changed イベントを配信する */
export function broadcastAuthToAll(status: AuthStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('auth-changed', status)
  }
}
