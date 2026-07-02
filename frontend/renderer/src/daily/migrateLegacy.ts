import type { DayRecord } from '../../../shared/types'
import { dailyRepository } from '../repositories/dailyRepository'

const MIGRATED_FLAG = 'daily.migratedToJson'
const KEY_PATTERN = /^(workStart|workEnd|telework|sessionOrder)\.(\d{4}-\d{2}-\d{2})$/

/**
 * localStorage の日次データ（workStart/workEnd/telework/sessionOrder）を
 * JSON ストアへ一度だけ移行する。消失を防ぐため
 * 「JSON 書き込み成功 → フラグ → 旧キー削除」の順を厳守する。
 */
export async function migrateLegacyDailyData(): Promise<void> {
  if (localStorage.getItem(MIGRATED_FLAG) === 'true') return

  const byDate = new Map<string, DayRecord>()
  const legacyKeys: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const m = KEY_PATTERN.exec(key)
    if (!m) continue
    legacyKeys.push(key)
    const field = m[1]
    const date = m[2]
    const value = localStorage.getItem(key)
    if (value == null) continue

    const record = byDate.get(date) ?? {}
    if (field === 'workStart') record.workStart = value
    else if (field === 'workEnd') record.workEnd = value
    else if (field === 'telework') record.telework = value === 'true'
    else if (field === 'sessionOrder') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
          record.sessionOrder = parsed
        }
      } catch { /* 壊れた順序は捨てる */ }
    }
    byDate.set(date, record)
  }

  const entries = [...byDate.entries()].map(([date, record]) => ({ date, record }))
  if (entries.length > 0) {
    await dailyRepository.importLegacy(entries) // JSON 書き込み成功を待つ
  }
  localStorage.setItem(MIGRATED_FLAG, 'true')   // 成功後にフラグ
  for (const key of legacyKeys) localStorage.removeItem(key) // フラグ後に旧キー削除
}
