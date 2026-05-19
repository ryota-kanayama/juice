import { net } from 'electron'

// 祝日データキャッシュ（プロセス起動中は使い回す）
let holidaysCache: Record<string, string> | null = null

/** 日本の祝日マップ（"YYYY-MM-DD" → 祝日名）を取得する。失敗時は空オブジェクトを返す。 */
export async function getHolidays(): Promise<Record<string, string>> {
  if (holidaysCache) return holidaysCache
  try {
    const response = await net.fetch('https://holidays-jp.github.io/api/v1/date.json')
    holidaysCache = await response.json()
    return holidaysCache ?? {}
  } catch {
    return {}
  }
}
