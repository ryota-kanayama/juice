// リリースノートのデータアクセス: window.bridge への依存をこの層に閉じ込める。
import type { ReleaseNoteEntry } from '../../../shared/types'

export const releaseNotesRepository = {
  /** 更新後に見せるノート。範囲ルールが空なら今のバージョンの節だけ返る */
  getCurrent(): Promise<ReleaseNoteEntry[]> {
    return window.bridge.getReleaseNotesCurrent()
  },
  /** これから入るバージョンのノート */
  getPending(): Promise<ReleaseNoteEntry[]> {
    return window.bridge.getReleaseNotesPending()
  },
  /** 見せたことを記録する（次の起動から出さない） */
  markSeen(): Promise<void> {
    return window.bridge.markReleaseNotesSeen()
  },
  openCurrent(): Promise<void> {
    return window.bridge.openReleaseNotesWindow()
  },
  openPending(): Promise<void> {
    return window.bridge.openReleaseNotesPendingWindow()
  },
  close(): Promise<void> {
    return window.bridge.closeReleaseNotesWindow()
  },
}
