import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'

interface Settings {
  themeId: string
  idleNotificationEnabled: boolean
  idleNotificationMinutes: number
  elapsedNotificationEnabled: boolean
  elapsedNotificationMinutes: number
  userName: string
  setupCompleted: boolean
  whiteboardEnabled: boolean
  whiteboardEmail: string
  slackProjectCode: string
  slackProjectName: string
}

const DEFAULT_SETTINGS: Settings = {
  themeId: 'milk',
  idleNotificationEnabled: false,
  idleNotificationMinutes: 60,
  elapsedNotificationEnabled: false,
  elapsedNotificationMinutes: 30,
  userName: '',
  setupCompleted: false,
  whiteboardEnabled: false,
  whiteboardEmail: '',
  slackProjectCode: '',
  slackProjectName: '',
}

export class SettingsStore {
  constructor(private dataDir: string) {}

  private migrateThemeId(id: string): string {
    const map: Record<string, string> = {
      // 2026-06 リアーキテクチャ前の5テーマ → 新テーマ
      slate: 'milk',
      rose: 'berry',
      sky: 'soda',
      lemon: 'mandarin',
      // それ以前の旧テーマ（旧マップの行き先を新テーマに付け替え）
      coral: 'berry',
      ocean: 'soda',
      honey: 'mandarin',
      crimson: 'graphite',
      ember: 'graphite',
      night: 'graphite',
      deep: 'graphite',
      amber: 'graphite',
      orange: 'mandarin',
      melon: 'matcha',
      peach: 'berry',
      cocoa: 'espresso',
      blackberry: 'cassis',
      olive: 'matcha',
      plum: 'cassis',
      juice: 'mandarin',
      forest: 'matcha',
      sakura: 'berry',
      lavender: 'grape',
      charcoal: 'graphite',
      sunset: 'mandarin',
      // grape / berry / midnight は新テーマとして復活したためマップから除外
    }
    const VALID = new Set([
      'milk', 'oatmilk', 'matcha', 'soda', 'grape', 'mandarin', 'berry',
      'graphite', 'midnight', 'cassis', 'espresso',
    ])
    const mapped = map[id] ?? id
    return VALID.has(mapped) ? mapped : 'milk'
  }

  private get filePath(): string {
    return join(this.dataDir, 'settings.json')
  }

  private async readAll(): Promise<Settings> {
    try {
      const content = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(content)
      return { ...DEFAULT_SETTINGS, ...parsed, themeId: this.migrateThemeId(parsed.themeId ?? DEFAULT_SETTINGS.themeId) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  private async writeAll(settings: Settings): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const tmpPath = `${this.filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8')
    await rename(tmpPath, this.filePath)
  }

  async getTheme(): Promise<string> {
    const s = await this.readAll()
    return s.themeId
  }

  async setTheme(themeId: string): Promise<void> {
    const s = await this.readAll()
    await this.writeAll({ ...s, themeId })
  }

  async getIdleSettings(): Promise<{ enabled: boolean; minutes: number }> {
    const s = await this.readAll()
    return {
      enabled: s.idleNotificationEnabled,
      minutes: s.idleNotificationMinutes,
    }
  }

  async setIdleSettings(enabled: boolean, minutes: number): Promise<void> {
    const s = await this.readAll()
    await this.writeAll({ ...s, idleNotificationEnabled: enabled, idleNotificationMinutes: minutes })
  }

  async getElapsedSettings(): Promise<{ enabled: boolean; minutes: number }> {
    const s = await this.readAll()
    return {
      enabled: s.elapsedNotificationEnabled,
      minutes: s.elapsedNotificationMinutes,
    }
  }

  async setElapsedSettings(enabled: boolean, minutes: number): Promise<void> {
    const s = await this.readAll()
    await this.writeAll({ ...s, elapsedNotificationEnabled: enabled, elapsedNotificationMinutes: minutes })
  }

  async getUserName(): Promise<string> {
    const s = await this.readAll()
    return s.userName
  }

  async setUserName(userName: string): Promise<void> {
    const s = await this.readAll()
    await this.writeAll({ ...s, userName })
  }

  async isSetupCompleted(): Promise<boolean> {
    const s = await this.readAll()
    return s.setupCompleted
  }

  async completeSetup(): Promise<void> {
    const s = await this.readAll()
    await this.writeAll({ ...s, setupCompleted: true })
  }

  async getWhiteboardSettings(): Promise<{ enabled: boolean; email: string }> {
    const s = await this.readAll()
    return {
      enabled: s.whiteboardEnabled,
      email: s.whiteboardEmail,
    }
  }

  async setWhiteboardSettings(enabled: boolean, email: string): Promise<void> {
    const s = await this.readAll()
    await this.writeAll({ ...s, whiteboardEnabled: enabled, whiteboardEmail: email })
  }

  async getSlackSettings(): Promise<{ projectCode: string; projectName: string }> {
    const s = await this.readAll()
    return {
      projectCode: s.slackProjectCode,
      projectName: s.slackProjectName,
    }
  }

  async setSlackSettings(projectCode: string, projectName: string): Promise<void> {
    const s = await this.readAll()
    await this.writeAll({ ...s, slackProjectCode: projectCode, slackProjectName: projectName })
  }
}
