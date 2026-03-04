import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SettingsStore } from './settingsStore'
import { rm, mkdir } from 'fs/promises'
import { join } from 'path'
import os from 'os'

const testDir = join(os.tmpdir(), 'juice-settings-test-' + Date.now())

describe('SettingsStore', () => {
  let store: SettingsStore

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    store = new SettingsStore(testDir)
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('設定ファイルが存在しない場合はデフォルトテーマ "rose" を返す', async () => {
    const themeId = await store.getTheme()
    expect(themeId).toBe('rose')
  })

  it('テーマを保存して取得できる', async () => {
    await store.setTheme('sky')
    const themeId = await store.getTheme()
    expect(themeId).toBe('sky')
  })

  it('テーマを変更できる', async () => {
    await store.setTheme('lemon')
    await store.setTheme('coral')
    const themeId = await store.getTheme()
    expect(themeId).toBe('coral')
  })

  it('旧テーマIDが新テーマIDにマイグレーションされる', async () => {
    await store.setTheme('orange')
    const themeId = await store.getTheme()
    expect(themeId).toBe('honey')
  })

  it('旧旧テーマIDもマイグレーションされる', async () => {
    await store.setTheme('midnight')
    const themeId = await store.getTheme()
    expect(themeId).toBe('deep')
  })

  it('新テーマIDはそのまま返される', async () => {
    await store.setTheme('crimson')
    const themeId = await store.getTheme()
    expect(themeId).toBe('crimson')
  })

  it('経過時間通知設定のデフォルト値が返る', async () => {
    const settings = await store.getElapsedSettings()
    expect(settings).toEqual({ enabled: false, minutes: 30 })
  })

  it('経過時間通知設定を保存して取得できる', async () => {
    await store.setElapsedSettings(true, 60)
    const settings = await store.getElapsedSettings()
    expect(settings).toEqual({ enabled: true, minutes: 60 })
  })

  it('経過時間通知設定を変更できる', async () => {
    await store.setElapsedSettings(true, 30)
    await store.setElapsedSettings(false, 15)
    const settings = await store.getElapsedSettings()
    expect(settings).toEqual({ enabled: false, minutes: 15 })
  })
})
