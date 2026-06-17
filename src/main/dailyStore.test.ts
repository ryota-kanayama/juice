import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { DailyStore } from './dailyStore'
import { formatLocalDate } from '../shared/sessionUtils'

let dir: string
let store: DailyStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'daily-test-'))
  store = new DailyStore(dir)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('DailyStore', () => {
  it('未存在の月は version 1 / 空 days を返す', async () => {
    expect(await store.getMonth('2026-06')).toEqual({ version: 1, days: {} })
    expect(await store.getDay('2026-06-17')).toBeNull()
  })

  it('setDay は部分更新し updatedAt を打刻する', async () => {
    await store.setDay('2026-06-17', { workStart: '09:00', telework: true })
    await store.setDay('2026-06-17', { workEnd: '18:00' })
    const day = await store.getDay('2026-06-17')
    expect(day?.workStart).toBe('09:00')
    expect(day?.telework).toBe(true)
    expect(day?.workEnd).toBe('18:00')
    expect(typeof day?.updatedAt).toBe('string')
    expect(day?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it('ファイルに version 1 として書かれる', async () => {
    await store.setDay('2026-06-17', { workStart: '09:00' })
    const raw = JSON.parse(await readFile(join(dir, 'daily-2026-06.json'), 'utf-8'))
    expect(raw.version).toBe(1)
    expect(raw.days['2026-06-17'].workStart).toBe('09:00')
  })

  it('本体破損時は .bak から読む', async () => {
    await store.setDay('2026-06-17', { workStart: '09:00' })
    await store.setDay('2026-06-17', { workEnd: '18:00' }) // .bak が作られる
    await writeFile(join(dir, 'daily-2026-06.json'), '{ broken', 'utf-8')
    const day = await store.getDay('2026-06-17')
    expect(day?.workStart).toBe('09:00') // .bak の内容（workEnd 前）
  })

  it('importLegacy は月ごとにまとめ、既存日は上書きしない', async () => {
    await store.setDay('2026-06-17', { workStart: '08:00' })
    await store.importLegacy([
      { date: '2026-06-17', record: { workStart: '09:00' } }, // 既存→無視
      { date: '2026-06-18', record: { telework: true } },
      { date: '2026-05-01', record: { workStart: '10:00' } },
    ])
    expect((await store.getDay('2026-06-17'))?.workStart).toBe('08:00')
    expect((await store.getDay('2026-06-18'))?.telework).toBe(true)
    expect((await store.getDay('2026-05-01'))?.workStart).toBe('10:00')
  })

  it('prune は keepDays より古い日付を削除する', async () => {
    const recent = formatLocalDate(Date.now())
    await store.setDay('2000-01-01', { workStart: '09:00' })
    await store.setDay(recent, { workStart: '09:00' })
    await store.prune(90)
    expect(await store.getDay('2000-01-01')).toBeNull()
    expect(await store.getDay(recent)).not.toBeNull()
  })

  it('不正な yearMonth / date は throw する', async () => {
    await expect(store.getMonth('2026/06')).rejects.toThrow()
    await expect(store.setDay('2026-6-1', {})).rejects.toThrow()
  })
})
