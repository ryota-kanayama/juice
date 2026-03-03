import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionStore } from './sessionStore'
import { rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import os from 'os'

const testDir = join(os.tmpdir(), 'juice-test-' + Date.now())

describe('SessionStore', () => {
  let store: SessionStore

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    store = new SessionStore(testDir)
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('存在しない月のセッションは空配列を返す', async () => {
    const sessions = await store.getSessions('2026-02')
    expect(sessions).toEqual([])
  })

  it('セッションを保存して取得できる', async () => {
    const session = {
      id: 'test-id',
      taskId: 'test-id',
      name: 'テスト作業',
      projectCode: 'P001',
      workCategory: '開発',
      times: [{ startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:30:00' }],
      date: '2026-02-25',
      color: '#FF9500',
      totalTime: 30,
    }
    await store.saveSession(session)
    const sessions = await store.getSessions('2026-02')
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toEqual(session)
  })

  it('セッションにtimesを追記して更新できる', async () => {
    const session = {
      id: 'test-id',
      taskId: 'test-id',
      name: 'テスト作業',
      projectCode: '',
      workCategory: '',
      times: [{ startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:30:00' }],
      date: '2026-02-25',
      color: '#FF9500',
      totalTime: 30,
    }
    await store.saveSession(session)
    const updated = {
      ...session,
      times: [
        ...session.times,
        { startTime: '2026-02-25T11:00:00', endTime: '2026-02-25T11:30:00' },
      ],
    }
    await store.updateSession(updated)
    const sessions = await store.getSessions('2026-02')
    expect(sessions[0].times).toHaveLength(2)
    expect(sessions[0].times[1].endTime).toBe('2026-02-25T11:30:00')
  })

  it('指定したIDのセッションを削除できる', async () => {
    const session = {
      id: 'delete-me',
      taskId: 'delete-me',
      name: '削除テスト',
      projectCode: '',
      workCategory: '',
      times: [{ startTime: '2026-02-27T10:00:00', endTime: '2026-02-27T10:30:00' }],
      date: '2026-02-27',
      color: '#FF9500',
      totalTime: 30,
    }
    await store.saveSession(session)
    await store.deleteSession('delete-me', '2026-02')
    const sessions = await store.getSessions('2026-02')
    expect(sessions).toHaveLength(0)
  })

  it('存在しないIDの削除は何もしない', async () => {
    // empty store — should not throw
    await expect(store.deleteSession('no-such-id', '2026-02')).resolves.toBeUndefined()
  })

  it('破損したJSONファイルの場合は.bakから復元する', async () => {
    const session = {
      id: 'bak-id',
      taskId: 'bak-id',
      name: 'バックアップテスト',
      projectCode: '',
      workCategory: '',
      times: [{ startTime: '2026-02-25T09:00:00', endTime: '2026-02-25T09:30:00' }],
      date: '2026-02-25',
      color: '#FF6B6B',
      totalTime: 30,
    }
    // 1回目の保存でプライマリが作成される
    await store.saveSession(session)
    // 2回目の保存でプライマリが.bakに退避され、新しいプライマリが作成される
    await store.updateSession({ ...session, name: '更新済み' })
    // プライマリを破損させる（.bakには1回目のデータが入っている）
    const primaryPath = join(testDir, 'sessions-2026-02.json')
    await writeFile(primaryPath, 'INVALID JSON', 'utf-8')
    const sessions = await store.getSessions('2026-02')
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('bak-id')
  })

  it('.bakも破損している場合は空配列を返す', async () => {
    const primaryPath = join(testDir, 'sessions-2026-02.json')
    const bakPath = `${primaryPath}.bak`
    await writeFile(primaryPath, 'BAD', 'utf-8')
    await writeFile(bakPath, 'BAD', 'utf-8')
    const sessions = await store.getSessions('2026-02')
    expect(sessions).toEqual([])
  })
})
