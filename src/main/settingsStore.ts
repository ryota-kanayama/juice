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
}

const DEFAULT_SETTINGS: Settings = {
  themeId: 'rose',
  idleNotificationEnabled: false,
  idleNotificationMinutes: 60,
  elapsedNotificationEnabled: false,
  elapsedNotificationMinutes: 30,
  userName: '',
  setupCompleted: false,
}

export class SettingsStore {
  constructor(private dataDir: string) {}

  private migrateThemeId(id: string): string {
    const map: Record<string, string> = {
      // 旧テーマ → 新テーマ
      orange: 'honey',
      lemon: 'lemon',
      grape: 'ocean',
      melon: 'sky',
      peach: 'coral',
      berry: 'rose',
      cocoa: 'amber',
      blackberry: 'deep',
      olive: 'night',
      plum: 'crimson',
      // 旧旧テーマ
      juice: 'honey',
      midnight: 'deep',
      ocean: 'sky',
      forest: 'sky',
      sakura: 'coral',
      lavender: 'ocean',
      charcoal: 'crimson',
      sunset: 'honey',
    }
    return map[id] ?? id
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
}
