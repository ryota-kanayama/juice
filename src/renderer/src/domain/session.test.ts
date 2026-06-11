import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applySessionEdit,
  createManualSession,
  appendRunningInterval,
  hasRunningInterval,
} from './session'
import type { Session } from '../types/session'
import { JUICE_COLOR_KEYS } from './colors'

// 2026-05-20 12:00:00 ローカル時刻を Date.now の基準にする
const NOW_MS = new Date('2026-05-20T12:00:00').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW_MS)
})

afterEach(() => {
  vi.useRealTimers()
})

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 's1',
  taskId: 't1',
  name: '作業A',
  projectCode: 'P',
  workCategory: '開発',
  times: [{ startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:30:00' }],
  date: '2026-05-20',
  color: '#FF9500',
  totalTime: 30,
  ...overrides,
})

describe('applySessionEdit', () => {
  it('name / projectCode / workCategory を更新する', () => {
    const { session, adjustedStartMs } = applySessionEdit(makeSession(), {
      name: '作業B',
      projectCode: 'Q',
      workCategory: '設計',
      totalMinutes: null,
    })
    expect(session.name).toBe('作業B')
    expect(session.projectCode).toBe('Q')
    expect(session.workCategory).toBe('設計')
    expect(session.totalTime).toBe(30)
    expect(adjustedStartMs).toBeUndefined()
  })

  it('totalMinutes=null の場合は時間を変更しない', () => {
    const { session } = applySessionEdit(makeSession({ totalTime: 45 }), {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      totalMinutes: null,
    })
    expect(session.totalTime).toBe(45)
  })

  it('完了セッションでは totalTime を直接書き換える', () => {
    const { session, adjustedStartMs } = applySessionEdit(makeSession(), {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      totalMinutes: 60,
    })
    expect(session.totalTime).toBe(60)
    expect(session.times[0]).toEqual({
      startTime: '2026-05-20T10:00:00',
      endTime: '2026-05-20T10:30:00',
    })
    expect(adjustedStartMs).toBeUndefined()
  })

  it('稼働中セッションでは最後の区間の開始時刻を調整し adjustedStartMs を返す', () => {
    // 元のセッション: 完了区間30分 + 稼働中（合計 totalTime=30）。
    // 「合計45分にしたい」→ 差分15分が新区間として必要 → 開始時刻は now-15分。
    const running = makeSession({
      times: [
        { startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:30:00' },
        { startTime: '2026-05-20T11:55:00', endTime: null },
      ],
    })
    const { session, adjustedStartMs } = applySessionEdit(running, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      totalMinutes: 45,
    })
    const expectedStartMs = NOW_MS - 15 * 60000
    expect(adjustedStartMs).toBe(expectedStartMs)
    // ISO 風 "YYYY-MM-DDTHH:mm:ss" のローカル文字列で比較
    expect(session.times[1].startTime).toBe('2026-05-20T11:45:00')
    // 完了区間は不変
    expect(session.times[0]).toEqual({
      startTime: '2026-05-20T10:00:00',
      endTime: '2026-05-20T10:30:00',
    })
  })

  it('稼働中で「合計が現在以下」を指定しても、新区間は最低1分とみなす', () => {
    // totalTime=30 のとき totalMinutes=30 を指定 → desiredElapsed=max(1, 0)=1分
    const running = makeSession({
      times: [{ startTime: '2026-05-20T11:55:00', endTime: null }],
      totalTime: 30,
    })
    const { adjustedStartMs } = applySessionEdit(running, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      totalMinutes: 30,
    })
    expect(adjustedStartMs).toBe(NOW_MS - 1 * 60000)
  })

  it('totalMinutes < 1 は無視する（時間を変更しない）', () => {
    const { session, adjustedStartMs } = applySessionEdit(makeSession({ totalTime: 30 }), {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      totalMinutes: 0,
    })
    expect(session.totalTime).toBe(30)
    expect(adjustedStartMs).toBeUndefined()
  })

  it('times が空のセッション（手動追加）でも totalTime を変更できる', () => {
    const manual = makeSession({ times: [], totalTime: 60 })
    const { session, adjustedStartMs } = applySessionEdit(manual, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      totalMinutes: 90,
    })
    expect(session.totalTime).toBe(90)
    expect(session.times).toEqual([])
    expect(adjustedStartMs).toBeUndefined()
  })
})

describe('createManualSession', () => {
  it('区間なし・本日付・totalTime を持つセッションを生成する', () => {
    const session = createManualSession({
      name: '会議', projectCode: 'P', workCategory: '打合せ', totalMinutes: 45,
    })
    expect(session.name).toBe('会議')
    expect(session.projectCode).toBe('P')
    expect(session.workCategory).toBe('打合せ')
    expect(session.totalTime).toBe(45)
    expect(session.times).toEqual([])
    expect(session.date).toBe('2026-05-20')
    // id === taskId（新規セッション）
    expect(session.id).toBe(session.taskId)
    // 色はパレットのキーから1つ
    expect(JUICE_COLOR_KEYS).toContain(session.color)
  })

  it('totalMinutes < 1 は最低1分にクランプする', () => {
    const session = createManualSession({
      name: 'X', projectCode: '', workCategory: '', totalMinutes: 0,
    })
    expect(session.totalTime).toBe(1)
  })
})

describe('appendRunningInterval', () => {
  it('endTime=null の区間を末尾に追加する', () => {
    const session = makeSession()
    const updated = appendRunningInterval(session)
    expect(updated.times).toHaveLength(2)
    expect(updated.times[1]).toEqual({
      startTime: '2026-05-20T12:00:00',
      endTime: null,
    })
    // 元の session は不変
    expect(session.times).toHaveLength(1)
  })
})

describe('hasRunningInterval', () => {
  it('endTime=null の区間があれば true', () => {
    expect(hasRunningInterval(makeSession({
      times: [{ startTime: '2026-05-20T10:00:00', endTime: null }],
    }))).toBe(true)
  })

  it('全区間が完了済みなら false', () => {
    expect(hasRunningInterval(makeSession())).toBe(false)
  })

  it('区間が空なら false', () => {
    expect(hasRunningInterval(makeSession({ times: [] }))).toBe(false)
  })
})
