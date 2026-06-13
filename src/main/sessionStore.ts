import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'
import type { Session, SessionFile, TimeInterval } from '../shared/types'
import { createSerialQueue } from './serialQueue'

/** "YYYY-MM"。ファイルパスに連結する前にパストラバーサルを防ぐため検証する */
const YEAR_MONTH = /^\d{4}-\d{2}$/
/** "YYYY-MM-DD"。session.date から yearMonth を導出する前に検証する */
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** 旧フォーマット（totalTime なし）のセッション向けに times[] から合計分を算出 */
function totalTimeFromIntervals(times: TimeInterval[]): number {
  let ms = 0
  for (const t of times ?? []) {
    if (t.endTime) ms += new Date(t.endTime).getTime() - new Date(t.startTime).getTime()
  }
  return Math.max(1, Math.round(ms / 60000))
}

export class SessionStore {
  constructor(private dataDir: string) {}

  /** write 系（read-modify-write）を直列化し、並行 IPC による lost-update を防ぐ */
  private enqueue = createSerialQueue()

  private filePath(yearMonth: string): string {
    if (!YEAR_MONTH.test(yearMonth)) {
      throw new Error(`invalid yearMonth: ${yearMonth}`)
    }
    return join(this.dataDir, `sessions-${yearMonth}.json`)
  }

  /** session.date を検証し yearMonth を導出する */
  private yearMonthOf(session: Session): string {
    if (!DATE.test(session.date)) {
      throw new Error(`invalid session.date: ${session.date}`)
    }
    return session.date.slice(0, 7)
  }

  async getSessions(yearMonth: string): Promise<Session[]> {
    const filePath = this.filePath(yearMonth) // 不正な yearMonth はここで throw（try の外で検証）
    const parse = (content: string): Session[] => {
      const data: SessionFile = JSON.parse(content)
      return data.sessions.map(s => ({
        ...s,
        projectCode: s.projectCode ?? '',
        workCategory: s.workCategory ?? '',
        totalTime: typeof s.totalTime === 'number' ? s.totalTime : totalTimeFromIntervals(s.times),
      }))
    }
    try {
      return parse(await readFile(filePath, 'utf-8'))
    } catch {
      try {
        return parse(await readFile(`${filePath}.bak`, 'utf-8'))
      } catch {
        return []
      }
    }
  }

  async saveSession(session: Session): Promise<void> {
    const yearMonth = this.yearMonthOf(session)
    await this.enqueue(async () => {
      const sessions = await this.getSessions(yearMonth)
      sessions.push(session)
      await this.write(yearMonth, sessions)
    })
  }

  async updateSession(session: Session): Promise<void> {
    const yearMonth = this.yearMonthOf(session)
    await this.enqueue(async () => {
      const sessions = await this.getSessions(yearMonth)
      const index = sessions.findIndex((s) => s.id === session.id)
      if (index !== -1) {
        sessions[index] = session
      } else {
        sessions.push(session)
      }
      await this.write(yearMonth, sessions)
    })
  }

  async deleteSession(id: string, yearMonth: string): Promise<void> {
    // 先に検証してから直列化（不正な yearMonth は即時に拒否する）
    this.filePath(yearMonth)
    await this.enqueue(async () => {
      const sessions = await this.getSessions(yearMonth)
      const filtered = sessions.filter(s => s.id !== id)
      await this.write(yearMonth, filtered)
    })
  }

  private async write(yearMonth: string, sessions: Session[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const filePath = this.filePath(yearMonth)
    const tmpPath = `${filePath}.tmp`
    const backupPath = `${filePath}.bak`
    const json = JSON.stringify({ sessions } satisfies SessionFile, null, 2)
    await writeFile(tmpPath, json, 'utf-8')
    try { await rename(filePath, backupPath) } catch { /* ファイル未存在は無視 */ }
    await rename(tmpPath, filePath)
  }
}
