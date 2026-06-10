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

  it('設定ファイルが存在しない場合はデフォルトテーマ "milk" を返す', async () => {
    const themeId = await store.getTheme()
    expect(themeId).toBe('milk')
  })

  it('テーマを保存して取得できる', async () => {
    await store.setTheme('soda')
    const themeId = await store.getTheme()
    expect(themeId).toBe('soda')
  })

  it('テーマを変更できる', async () => {
    await store.setTheme('berry')
    await store.setTheme('soda')
    const themeId = await store.getTheme()
    expect(themeId).toBe('soda')
  })

  it.each([
    ['slate', 'milk'],
    ['rose', 'berry'],
    ['sky', 'soda'],
    ['lemon', 'mandarin'],
    ['graphite', 'graphite'],
  ])('旧テーマID %s は %s に移行される', async (oldId, newId) => {
    await store.setTheme(oldId)
    const themeId = await store.getTheme()
    expect(themeId).toBe(newId)
  })

  it('新テーマID はそのまま返る', async () => {
    await store.setTheme('cassis')
    expect(await store.getTheme()).toBe('cassis')
  })

  it('未知のテーマIDは milk にフォールバックする', async () => {
    await store.setTheme('unknown-xyz')
    const themeId = await store.getTheme()
    expect(themeId).toBe('milk')
  })

  it('現行テーマIDはそのまま返される', async () => {
    await store.setTheme('soda')
    const themeId = await store.getTheme()
    expect(themeId).toBe('soda')
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

  it('ホワイトボード設定のデフォルト値が返る', async () => {
    const settings = await store.getWhiteboardSettings()
    expect(settings).toEqual({ enabled: false, email: '' })
  })

  it('ホワイトボード設定を保存して取得できる', async () => {
    await store.setWhiteboardSettings(true, 'test@jsl.co.jp')
    const settings = await store.getWhiteboardSettings()
    expect(settings).toEqual({ enabled: true, email: 'test@jsl.co.jp' })
  })
})
