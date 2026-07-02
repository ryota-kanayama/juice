// アップデートのデータアクセス: window.bridge への依存をこの層に閉じ込める。
import type { UpdateInfo } from '../../../shared/types'

export interface UpdateProgress { percent: number; done: boolean; error?: string }

export const updateRepository = {
  check(): Promise<UpdateInfo> {
    return window.bridge.checkForUpdate()
  },
  install(): Promise<void> {
    return window.bridge.installUpdate()
  },
  readyToQuit(): Promise<void> {
    return window.bridge.readyToQuit()
  },
  onPrepareQuit(cb: () => void): () => void {
    return window.bridge.onUpdatePrepareQuit(cb)
  },
  dismiss(version: string): Promise<void> {
    return window.bridge.dismissUpdate(version)
  },
  onAvailable(cb: (info: UpdateInfo) => void): () => void {
    return window.bridge.onUpdateAvailable(cb)
  },
  onProgress(cb: (p: UpdateProgress) => void): () => void {
    return window.bridge.onUpdateProgress(cb)
  },
  getCurrentVersion(): Promise<string> {
    return window.bridge.getAppVersion()
  },
}
