import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join } from 'path'
import { createSerialQueue } from './serialQueue'

interface Settings {
  themeId: string
  idleNotificationEnabled: boolean
  idleNotificationMinutes: number
  elapsedNotificationEnabled: boolean
  elapsedNotificationMinutes: number
  pomodoroEnabled: boolean
  setupCompleted: boolean
  whiteboardEnabled: boolean
}

const DEFAULT_SETTINGS: Settings = {
  themeId: 'milk',
  idleNotificationEnabled: false,
  idleNotificationMinutes: 60,
  elapsedNotificationEnabled: false,
  elapsedNotificationMinutes: 30,
  pomodoroEnabled: false,
  setupCompleted: false,
  whiteboardEnabled: false,
}

export class SettingsStore {
  constructor(private dataDir: string) {}

  /** read-modify-write を直列化し、並行 set による lost-update を防ぐ */
  private enqueue = createSerialQueue()

  /** 現在の設定を読み、mutate を適用して書き戻す（直列化される） */
  private update(mutate: (s: Settings) => Settings): Promise<void> {
    return this.enqueue(async () => {
      const s = await this.readAll()
      await this.writeAll(mutate(s))
    })
  }

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
    const parse = (content: string): Settings => {
      const parsed = JSON.parse(content) as Partial<Settings>
      // Settings の既知キーだけを採用し、未知キー（旧 slackProjectCode 等）を捨てる。
      // 各キーは欠落時 DEFAULT_SETTINGS で補完する。
      return {
        themeId: this.migrateThemeId(parsed.themeId ?? DEFAULT_SETTINGS.themeId),
        idleNotificationEnabled: parsed.idleNotificationEnabled ?? DEFAULT_SETTINGS.idleNotificationEnabled,
        idleNotificationMinutes: parsed.idleNotificationMinutes ?? DEFAULT_SETTINGS.idleNotificationMinutes,
        elapsedNotificationEnabled: parsed.elapsedNotificationEnabled ?? DEFAULT_SETTINGS.elapsedNotificationEnabled,
        elapsedNotificationMinutes: parsed.elapsedNotificationMinutes ?? DEFAULT_SETTINGS.elapsedNotificationMinutes,
        pomodoroEnabled: parsed.pomodoroEnabled ?? DEFAULT_SETTINGS.pomodoroEnabled,
        setupCompleted: parsed.setupCompleted ?? DEFAULT_SETTINGS.setupCompleted,
        whiteboardEnabled: parsed.whiteboardEnabled ?? DEFAULT_SETTINGS.whiteboardEnabled,
      }
    }
    try {
      return parse(await readFile(this.filePath, 'utf-8'))
    } catch {
      // プライマリが破損/未存在なら .bak から復元を試みる
      try {
        return parse(await readFile(`${this.filePath}.bak`, 'utf-8'))
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    }
  }

  private async writeAll(settings: Settings): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const tmpPath = `${this.filePath}.tmp`
    const backupPath = `${this.filePath}.bak`
    await writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8')
    // tmp 書き込み成功後に旧ファイルを .bak へ退避してから差し替える（破損耐性）
    try { await rename(this.filePath, backupPath) } catch { /* ファイル未存在は無視 */ }
    await rename(tmpPath, this.filePath)
  }

  async getTheme(): Promise<string> {
    const s = await this.readAll()
    return s.themeId
  }

  async setTheme(themeId: string): Promise<void> {
    await this.update(s => ({ ...s, themeId }))
  }

  async getIdleSettings(): Promise<{ enabled: boolean; minutes: number }> {
    const s = await this.readAll()
    return {
      enabled: s.idleNotificationEnabled,
      minutes: s.idleNotificationMinutes,
    }
  }

  async setIdleSettings(enabled: boolean, minutes: number): Promise<void> {
    await this.update(s => ({ ...s, idleNotificationEnabled: enabled, idleNotificationMinutes: minutes }))
  }

  async getElapsedSettings(): Promise<{ enabled: boolean; minutes: number }> {
    const s = await this.readAll()
    return {
      enabled: s.elapsedNotificationEnabled,
      minutes: s.elapsedNotificationMinutes,
    }
  }

  async setElapsedSettings(enabled: boolean, minutes: number): Promise<void> {
    await this.update(s => ({ ...s, elapsedNotificationEnabled: enabled, elapsedNotificationMinutes: minutes }))
  }

  async getPomodoroSettings(): Promise<{ enabled: boolean }> {
    const s = await this.readAll()
    return { enabled: s.pomodoroEnabled }
  }

  async setPomodoroSettings(enabled: boolean): Promise<void> {
    await this.update(s => ({ ...s, pomodoroEnabled: enabled }))
  }

  async isSetupCompleted(): Promise<boolean> {
    const s = await this.readAll()
    return s.setupCompleted
  }

  async completeSetup(): Promise<void> {
    await this.update(s => ({ ...s, setupCompleted: true }))
  }

  async getWhiteboardSettings(): Promise<{ enabled: boolean }> {
    const s = await this.readAll()
    return { enabled: s.whiteboardEnabled }
  }

  async setWhiteboardSettings(enabled: boolean): Promise<void> {
    await this.update(s => ({ ...s, whiteboardEnabled: enabled }))
  }
}
