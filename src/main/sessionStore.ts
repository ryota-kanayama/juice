import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'
import type { Session, SessionFile } from '../shared/types'

export class SessionStore {
  constructor(private dataDir: string) {}

  private filePath(yearMonth: string): string {
    return join(this.dataDir, `sessions-${yearMonth}.json`)
  }

  async getSessions(yearMonth: string): Promise<Session[]> {
    const parse = (content: string): Session[] => {
      const data: SessionFile = JSON.parse(content)
      return data.sessions
        .filter(s => typeof s.totalTime === 'number')
        .map(s => ({
          ...s,
          projectCode: s.projectCode ?? '',
          workCategory: s.workCategory ?? '',
        }))
    }
    try {
      return parse(await readFile(this.filePath(yearMonth), 'utf-8'))
    } catch {
      try {
        return parse(await readFile(`${this.filePath(yearMonth)}.bak`, 'utf-8'))
      } catch {
        return []
      }
    }
  }

  async saveSession(session: Session): Promise<void> {
    const yearMonth = session.date.slice(0, 7)
    const sessions = await this.getSessions(yearMonth)
    sessions.push(session)
    await this.write(yearMonth, sessions)
  }

  async updateSession(session: Session): Promise<void> {
    const yearMonth = session.date.slice(0, 7)
    const sessions = await this.getSessions(yearMonth)
    const index = sessions.findIndex((s) => s.id === session.id)
    if (index !== -1) {
      sessions[index] = session
    } else {
      sessions.push(session)
    }
    await this.write(yearMonth, sessions)
  }

  async deleteSession(id: string, yearMonth: string): Promise<void> {
    const sessions = await this.getSessions(yearMonth)
    const filtered = sessions.filter(s => s.id !== id)
    await this.write(yearMonth, filtered)
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
