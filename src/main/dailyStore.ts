import { readFile, writeFile, mkdir, rename, readdir } from 'fs/promises'
import { join } from 'path'
import type { DailyMonth, DayRecord } from '../shared/types'
import { createSerialQueue } from './serialQueue'

/** "YYYY-MM"。ファイルパス連結前にパストラバーサルを防ぐため検証する */
const YEAR_MONTH = /^\d{4}-\d{2}$/
/** "YYYY-MM-DD"。date から yearMonth を導出する前に検証する */
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CURRENT_VERSION = 1

export class DailyStore {
  constructor(private dataDir: string) {}

  /** write 系（read-modify-write）を直列化し、並行 IPC による lost-update を防ぐ */
  private enqueue = createSerialQueue()

  private filePath(yearMonth: string): string {
    if (!YEAR_MONTH.test(yearMonth)) throw new Error(`invalid yearMonth: ${yearMonth}`)
    return join(this.dataDir, `daily-${yearMonth}.json`)
  }

  private yearMonthOf(date: string): string {
    if (!DATE.test(date)) throw new Error(`invalid date: ${date}`)
    return date.slice(0, 7)
  }

  async getMonth(yearMonth: string): Promise<DailyMonth> {
    const filePath = this.filePath(yearMonth) // 不正な yearMonth はここで throw（try の外）
    const parse = (content: string): DailyMonth => {
      const data = JSON.parse(content) as Partial<DailyMonth>
      return {
        version: typeof data.version === 'number' ? data.version : CURRENT_VERSION,
        days: data.days ?? {},
      }
    }
    try {
      return parse(await readFile(filePath, 'utf-8'))
    } catch {
      try {
        return parse(await readFile(`${filePath}.bak`, 'utf-8'))
      } catch {
        return { version: CURRENT_VERSION, days: {} }
      }
    }
  }

  async getDay(date: string): Promise<DayRecord | null> {
    const month = await this.getMonth(this.yearMonthOf(date))
    return month.days[date] ?? null
  }

  async setDay(date: string, patch: DayRecord): Promise<void> {
    const yearMonth = this.yearMonthOf(date)
    await this.enqueue(async () => {
      const month = await this.getMonth(yearMonth)
      const existing = month.days[date] ?? {}
      month.days[date] = { ...existing, ...patch, updatedAt: new Date().toISOString() }
      await this.write(yearMonth, month)
    })
  }

  /** localStorage からの一括移行。月ごとにまとめて書き、既存日は上書きしない。 */
  async importLegacy(entries: Array<{ date: string; record: DayRecord }>): Promise<void> {
    const byMonth = new Map<string, Array<{ date: string; record: DayRecord }>>()
    for (const e of entries) {
      const ym = this.yearMonthOf(e.date)
      const list = byMonth.get(ym) ?? []
      list.push(e)
      byMonth.set(ym, list)
    }
    for (const [yearMonth, list] of byMonth) {
      await this.enqueue(async () => {
        const month = await this.getMonth(yearMonth)
        const stamp = new Date().toISOString()
        for (const { date, record } of list) {
          if (month.days[date]) continue // 既にデータがある日は触らない
          month.days[date] = { ...record, updatedAt: stamp }
        }
        await this.write(yearMonth, month)
      })
    }
  }

  /** keepDays より古い日付エントリを全月ファイルから削除する */
  async prune(keepDays: number): Promise<void> {
    const cutoffMs = Date.now() - keepDays * 24 * 60 * 60 * 1000
    const cutoff = new Date(cutoffMs).toISOString().slice(0, 10) // "YYYY-MM-DD"
    let files: string[]
    try {
      files = await readdir(this.dataDir)
    } catch {
      return // dataDir 未存在なら何もしない
    }
    const months = files
      .filter(f => /^daily-\d{4}-\d{2}\.json$/.test(f))
      .map(f => f.slice('daily-'.length, -'.json'.length))
    for (const yearMonth of months) {
      await this.enqueue(async () => {
        const month = await this.getMonth(yearMonth)
        let changed = false
        for (const date of Object.keys(month.days)) {
          if (date < cutoff) { delete month.days[date]; changed = true }
        }
        if (changed) await this.write(yearMonth, month)
      })
    }
  }

  private async write(yearMonth: string, month: DailyMonth): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const filePath = this.filePath(yearMonth)
    const tmpPath = `${filePath}.tmp`
    const backupPath = `${filePath}.bak`
    const json = JSON.stringify(
      { version: CURRENT_VERSION, days: month.days } satisfies DailyMonth, null, 2
    )
    await writeFile(tmpPath, json, 'utf-8')
    try { await rename(filePath, backupPath) } catch { /* ファイル未存在は無視 */ }
    await rename(tmpPath, filePath)
  }
}
