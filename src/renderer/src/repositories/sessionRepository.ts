import type { Session } from '../types/session'

// セッションのデータアクセス: window.electronAPI（IPC）への依存をこの層に閉じ込める。

export const sessionRepository = {
  /** 指定年月（"YYYY-MM"）のセッションを取得する */
  list(yearMonth: string): Promise<Session[]> {
    return window.electronAPI.getSessions(yearMonth)
  },
  /** セッションを新規保存する */
  save(session: Session): Promise<void> {
    return window.electronAPI.saveSession(session)
  },
  /** 既存セッションを更新する */
  update(session: Session): Promise<void> {
    return window.electronAPI.updateSession(session)
  },
  /** セッションを削除する */
  remove(id: string, yearMonth: string): Promise<void> {
    return window.electronAPI.deleteSession(id, yearMonth)
  },
}
