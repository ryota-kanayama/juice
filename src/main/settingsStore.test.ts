import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SettingsStore } from './settingsStore'
import { rm, mkdir, writeFile, readFile, mkdtemp } from 'fs/promises'
import { join } from 'path'
import os, { tmpdir } from 'os'

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
    expect(settings).toEqual({ enabled: false })
  })

  it('ホワイトボード設定を保存して取得できる', async () => {
    await store.setWhiteboardSettings(true)
    const settings = await store.getWhiteboardSettings()
    expect(settings).toEqual({ enabled: true })
  })

  it('ポモドーロ設定のデフォルトは無効', async () => {
    const s = await store.getPomodoroSettings()
    expect(s).toEqual({ enabled: false })
  })

  it('ポモドーロ設定を保存して取得できる', async () => {
    await store.setPomodoroSettings(true)
    expect(await store.getPomodoroSettings()).toEqual({ enabled: true })
  })

  it('ポモドーロ設定を変更できる', async () => {
    await store.setPomodoroSettings(true)
    await store.setPomodoroSettings(false)
    expect(await store.getPomodoroSettings()).toEqual({ enabled: false })
  })

  it('settings.json が破損していても .bak から復元する', async () => {
    // 2回書き込んで .bak を作る（1回目が .bak に退避される）
    await store.setTheme('soda')
    await store.setElapsedSettings(true, 45)
    // プライマリを破損させる
    await writeFile(join(testDir, 'settings.json'), 'INVALID JSON', 'utf-8')
    // .bak には setTheme('soda') 直後の状態が入っている
    const themeId = await store.getTheme()
    expect(themeId).toBe('soda')
  })

  it('書き込み時に .bak が作成される', async () => {
    await store.setTheme('berry')
    await store.setTheme('matcha')
    const bak = JSON.parse(await readFile(join(testDir, 'settings.json.bak'), 'utf-8'))
    expect(bak.themeId).toBe('berry')
  })

  it('並行 set でも全ての変更が反映される（lost-update なし）', async () => {
    // 異なるフィールドへの並行書き込みが互いを打ち消さないこと
    await Promise.all([
      store.setTheme('soda'),
      store.setElapsedSettings(true, 60),
      store.setPomodoroSettings(true),
      store.setWhiteboardSettings(true),
    ])
    expect(await store.getTheme()).toBe('soda')
    expect(await store.getElapsedSettings()).toEqual({ enabled: true, minutes: 60 })
    expect(await store.getPomodoroSettings()).toEqual({ enabled: true })
    expect(await store.getWhiteboardSettings()).toEqual({ enabled: true })
  })

  it('getBreakBehaviorSettings はデフォルト stop を返す', async () => {
    const result = await store.getBreakBehaviorSettings()
    expect(result.behavior).toBe('stop')
  })

  it('setBreakBehaviorSettings で pause を永続化できる', async () => {
    await store.setBreakBehaviorSettings('pause')
    const result = await store.getBreakBehaviorSettings()
    expect(result.behavior).toBe('pause')
  })

  it('dismissedUpdateVersion を保存・取得できる（既定は空文字）', async () => {
    expect(await store.getDismissedUpdateVersion()).toBe('')
    await store.setDismissedUpdateVersion('1.2.0')
    expect(await store.getDismissedUpdateVersion()).toBe('1.2.0')
  })
})

describe('mainProjectCode', () => {
  let store: SettingsStore
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'settings-mainproj-'))
    store = new SettingsStore(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('未設定時は空文字を返す', async () => {
    expect(await store.getMainProjectCode()).toBe('')
  })

  it('設定・取得できる', async () => {
    await store.setMainProjectCode('PROJ-001')
    expect(await store.getMainProjectCode()).toBe('PROJ-001')
  })

  it('空文字に戻せる', async () => {
    await store.setMainProjectCode('PROJ-001')
    await store.setMainProjectCode('')
    expect(await store.getMainProjectCode()).toBe('')
  })
})

describe('SettingsStore — 未知キーの掃除', () => {
  let dir: string
  let store: SettingsStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'settings-test-'))
    store = new SettingsStore(dir)
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('死にフィールドを読み込んでも書き戻し時に落ちる', async () => {
    const path = join(dir, 'settings.json')
    await writeFile(path, JSON.stringify({
      themeId: 'grape',
      slackProjectCode: 'SE26010',
      slackProjectName: 'X',
      userName: 'Ryota',
      whiteboardEmail: '',
    }), 'utf-8')

    // 任意の set で書き戻しを誘発する
    await store.setTheme('grape')

    const written = JSON.parse(await readFile(path, 'utf-8'))
    expect(written.slackProjectCode).toBeUndefined()
    expect(written.slackProjectName).toBeUndefined()
    expect(written.userName).toBeUndefined()
    expect(written.whiteboardEmail).toBeUndefined()
    expect(written.themeId).toBe('grape')
  })
})
