import type { DailyMonth, DayRecord } from '../../../shared/types'

// 日次データのデータアクセス: window.bridge（IPC）への依存をこの層に閉じ込める。

export const dailyRepository = {
  /** 指定年月（"YYYY-MM"）の日次データを取得する */
  getMonth(yearMonth: string): Promise<DailyMonth> {
    return window.bridge.getDailyMonth(yearMonth)
  },
  /** 1日分を部分更新する（updatedAt は main 側で打刻される） */
  setDay(date: string, patch: DayRecord): Promise<void> {
    return window.bridge.setDailyDay(date, patch)
  },
  /** keepDays より古い日付を掃除する */
  prune(keepDays: number): Promise<void> {
    return window.bridge.pruneDaily(keepDays)
  },
  /** localStorage からの一括移行 */
  importLegacy(entries: Array<{ date: string; record: DayRecord }>): Promise<void> {
    return window.bridge.importLegacyDaily(entries)
  },
}
