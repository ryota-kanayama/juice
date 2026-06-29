// アップデートのデータアクセス: window.electronAPI への依存をこの層に閉じ込める。
import type { UpdateInfo } from '../../../shared/types'

export interface UpdateProgress { percent: number; done: boolean; error?: string }

export const updateRepository = {
  check(): Promise<UpdateInfo> {
    return window.electronAPI.checkForUpdate()
  },
  download(): Promise<void> {
    return window.electronAPI.downloadUpdate()
  },
  install(): Promise<void> {
    return window.electronAPI.installUpdate()
  },
  readyToQuit(): Promise<void> {
    return window.electronAPI.readyToQuit()
  },
  onPrepareQuit(cb: () => void): () => void {
    return window.electronAPI.onUpdatePrepareQuit(cb)
  },
  restart(): Promise<void> {
    return window.electronAPI.restartForUpdate()
  },
  dismiss(version: string): Promise<void> {
    return window.electronAPI.dismissUpdate(version)
  },
  onAvailable(cb: (info: UpdateInfo) => void): () => void {
    return window.electronAPI.onUpdateAvailable(cb)
  },
  onProgress(cb: (p: UpdateProgress) => void): () => void {
    return window.electronAPI.onUpdateProgress(cb)
  },
  onInstalled(cb: (p: { version: string }) => void): () => void {
    return window.electronAPI.onUpdateInstalled(cb)
  },
  getCurrentVersion(): Promise<string> {
    return window.electronAPI.getAppVersion()
  },
}
