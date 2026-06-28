import { BrowserWindow } from 'electron'
import type { IpcEventName, IpcEventPayload } from '../../shared/ipc'

/** 全ウィンドウへ main→renderer イベントを配信する汎用ヘルパ */
export function broadcastToAll<E extends IpcEventName>(event: E, payload: IpcEventPayload<E>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(event, payload)
  }
}
