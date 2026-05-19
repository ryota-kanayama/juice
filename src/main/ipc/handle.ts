import { ipcMain, IpcMainInvokeEvent } from 'electron'
import type { IpcChannel, IpcArg, IpcReturn } from '../../shared/ipc'

/**
 * 型付き ipcMain.handle。チャンネル名・引数・戻り値が IpcContract に従っているかを
 * コンパイル時に検証する。preload 側の invoke と対称。
 */
export function handle<C extends IpcChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, arg: IpcArg<C>) => Promise<IpcReturn<C>> | IpcReturn<C>
): void {
  ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1])
}
