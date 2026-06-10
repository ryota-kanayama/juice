import { formatLocalDate } from '../../shared/sessionUtils'

// 日付（"YYYY-MM-DD"）ごとの勤務関連データを localStorage に永続化する。
// アクセスをこのモジュールに集約し、キー文字列の散在とタイプミスを防ぐ。

const WORK_START = 'workStart'
const WORK_END = 'workEnd'
const TELEWORK = 'telework'
const SESSION_ORDER = 'sessionOrder'

export const dailyStore = {
  getWorkStart(date: string): string | null {
    return localStorage.getItem(`${WORK_START}.${date}`)
  },
  setWorkStart(date: string, value: string): void {
    localStorage.setItem(`${WORK_START}.${date}`, value)
  },

  getWorkEnd(date: string): string | null {
    return localStorage.getItem(`${WORK_END}.${date}`)
  },
  setWorkEnd(date: string, value: string): void {
    localStorage.setItem(`${WORK_END}.${date}`, value)
  },

  getTelework(date: string): boolean {
    return localStorage.getItem(`${TELEWORK}.${date}`) === 'true'
  },
  setTelework(date: string, value: boolean): void {
    localStorage.setItem(`${TELEWORK}.${date}`, String(value))
  },

  getSessionOrder(date: string): string[] | null {
    const stored = localStorage.getItem(`${SESSION_ORDER}.${date}`)
    return stored ? JSON.parse(stored) : null
  },
  setSessionOrder(date: string, order: string[]): void {
    localStorage.setItem(`${SESSION_ORDER}.${date}`, JSON.stringify(order))
  },

  /** keepDays より古い日付キーを削除する（無制限な蓄積を防ぐ） */
  pruneOldKeys(keepDays = 90): void {
    const cutoff = formatLocalDate(Date.now() - keepDays * 24 * 60 * 60 * 1000)
    const pattern = new RegExp(`^(${WORK_START}|${WORK_END}|${TELEWORK}|${SESSION_ORDER})\\.(\\d{4}-\\d{2}-\\d{2})$`)
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const m = pattern.exec(key)
      if (m && m[2] < cutoff) stale.push(key)
    }
    for (const key of stale) localStorage.removeItem(key)
  },
}
