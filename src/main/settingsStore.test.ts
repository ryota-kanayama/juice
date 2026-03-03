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

  it('設定ファイルが存在しない場合はデフォルトテーマ "orange" を返す', async () => {
    const themeId = await store.getTheme()
    expect(themeId).toBe('orange')
  })

  it('テーマを保存して取得できる', async () => {
    await store.setTheme('grape')
    const themeId = await store.getTheme()
    expect(themeId).toBe('grape')
  })

  it('テーマを変更できる', async () => {
    await store.setTheme('melon')
    await store.setTheme('peach')
    const themeId = await store.getTheme()
    expect(themeId).toBe('peach')
  })

  it('旧テーマIDが新しいフルーツテーマIDにマイグレーションされる', async () => {
    await store.setTheme('midnight')
    const themeId = await store.getTheme()
    expect(themeId).toBe('grape')
  })

  it('未知のテーマIDはそのまま返される', async () => {
    await store.setTheme('berry')
    const themeId = await store.getTheme()
    expect(themeId).toBe('berry')
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
