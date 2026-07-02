import type { Session } from '../types/session'

// セッションのデータアクセス: window.bridge（IPC）への依存をこの層に閉じ込める。

export const sessionRepository = {
  /** 指定年月（"YYYY-MM"）のセッションを取得する */
  list(yearMonth: string): Promise<Session[]> {
    return window.bridge.getSessions(yearMonth)
  },
  /** セッションを新規保存する */
  save(session: Session): Promise<void> {
    return window.bridge.saveSession(session)
  },
  /** 既存セッションを更新する */
  update(session: Session): Promise<void> {
    return window.bridge.updateSession(session)
  },
  /** セッションを削除する */
  remove(id: string, yearMonth: string): Promise<void> {
    return window.bridge.deleteSession(id, yearMonth)
  },
}
