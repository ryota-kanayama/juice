import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applySessionEdit,
  createManualSession,
  appendRunningInterval,
  hasRunningInterval,
  dayTimeRange,
  totalMinutesOf,
  hasReliableTimes,
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

describe('createManualSession', () => {
  it('区間から totalTime を算出する', () => {
    const s = createManualSession({
      name: '設計',
      projectCode: 'P001',
      workCategory: '開発',
      times: [{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:30:00' }],
    })
    expect(s.totalTime).toBe(90)
    expect(s.times).toEqual([{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:30:00' }])
  })

  it('date は最初の区間の日付から決まる', () => {
    const s = createManualSession({
      name: '設計', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-05-18T09:00:00', endTime: '2026-05-18T09:30:00' }],
    })
    expect(s.date).toBe('2026-05-18')
  })

  it('複数区間を合算する', () => {
    const s = createManualSession({
      name: '設計', projectCode: '', workCategory: '',
      times: [
        { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
        { startTime: '2026-05-20T13:00:00', endTime: '2026-05-20T14:00:00' },
      ],
    })
    expect(s.totalTime).toBe(120)
  })

  it('id と taskId が同じ値になる', () => {
    const s = createManualSession({
      name: '設計', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T09:30:00' }],
    })
    expect(s.taskId).toBe(s.id)
  })

  it('色はパレットから選ばれる', () => {
    const s = createManualSession({
      name: '設計', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T09:30:00' }],
    })
    expect(JUICE_COLOR_KEYS).toContain(s.color)
  })

  it('telework を渡すと workLocation が付く', () => {
    const s = createManualSession({
      name: '設計', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T09:30:00' }],
      workLocation: 'telework',
    })
    expect(s.workLocation).toBe('telework')
  })

  it('office を渡すと workLocation は付かない', () => {
    const s = createManualSession({
      name: '設計', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T09:30:00' }],
      workLocation: 'office',
    })
    expect(s.workLocation).toBeUndefined()
  })
})

describe('applySessionEdit', () => {
  it('名前・PJコード・作業区分を差し替える', () => {
    const { session } = applySessionEdit(makeSession(), {
      name: '設計レビュー', projectCode: 'P002', workCategory: 'レビュー',
      times: [{ startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:30:00' }],
      totalMinutes: null,
    })
    expect(session.name).toBe('設計レビュー')
    expect(session.projectCode).toBe('P002')
    expect(session.workCategory).toBe('レビュー')
  })

  it('区間を差し替えると totalTime も追従する', () => {
    const { session } = applySessionEdit(makeSession(), {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: [{ startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T12:00:00' }],
      totalMinutes: null,
    })
    expect(session.times).toHaveLength(1)
    expect(session.totalTime).toBe(120)
  })

  it('区間を増やすと合計に反映される', () => {
    const { session } = applySessionEdit(makeSession(), {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: [
        { startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T11:00:00' },
        { startTime: '2026-05-20T13:00:00', endTime: '2026-05-20T13:30:00' },
      ],
      totalMinutes: null,
    })
    expect(session.totalTime).toBe(90)
  })

  it('times が null なら totalTime だけ差し替える（レガシー）', () => {
    const legacy = makeSession({ times: [], totalTime: 45 })
    const { session } = applySessionEdit(legacy, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: null, totalMinutes: 90,
    })
    expect(session.totalTime).toBe(90)
    expect(session.times).toEqual([])
  })

  it('レガシーで totalMinutes が 0 以下なら totalTime を変えない', () => {
    const legacy = makeSession({ times: [], totalTime: 45 })
    const { session } = applySessionEdit(legacy, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: null, totalMinutes: 0,
    })
    expect(session.totalTime).toBe(45)
  })

  it('稼働中の区間は totalTime に含めない', () => {
    const running = makeSession({
      times: [
        { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
        { startTime: '2026-05-20T11:00:00', endTime: null },
      ],
      totalTime: 60,
    })
    const { session } = applySessionEdit(running, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: running.times, totalMinutes: null,
    })
    expect(session.totalTime).toBe(60)
    expect(session.times[1].endTime).toBeNull()
  })

  it('稼働中区間の開始を変えると adjustedStartMs を返す', () => {
    const running = makeSession({
      times: [{ startTime: '2026-05-20T11:00:00', endTime: null }],
      totalTime: 0,
    })
    const { adjustedStartMs } = applySessionEdit(running, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: [{ startTime: '2026-05-20T10:30:00', endTime: null }],
      totalMinutes: null,
    })
    expect(adjustedStartMs).toBe(new Date('2026-05-20T10:30:00').getTime())
  })

  it('稼働中区間の開始が変わらなければ adjustedStartMs は返さない', () => {
    const running = makeSession({
      times: [{ startTime: '2026-05-20T11:00:00', endTime: null }],
      totalTime: 0,
    })
    const { adjustedStartMs } = applySessionEdit(running, {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: [{ startTime: '2026-05-20T11:00:00', endTime: null }],
      totalMinutes: null,
    })
    expect(adjustedStartMs).toBeUndefined()
  })

  it('停止済みセッションでは adjustedStartMs を返さない', () => {
    const { adjustedStartMs } = applySessionEdit(makeSession(), {
      name: '作業A', projectCode: 'P', workCategory: '開発',
      times: [{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' }],
      totalMinutes: null,
    })
    expect(adjustedStartMs).toBeUndefined()
  })

  it('元の session は書き換えない', () => {
    const original = makeSession()
    applySessionEdit(original, {
      name: '別名', projectCode: 'X', workCategory: 'Y',
      times: [{ startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T12:00:00' }],
      totalMinutes: null,
    })
    expect(original.name).toBe('作業A')
    expect(original.totalTime).toBe(30)
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

describe('dayTimeRange', () => {
  it('区間が1つならその開始と終了を返す', () => {
    expect(dayTimeRange([makeSession()])).toEqual({ start: '10:00', end: '10:30' })
  })

  it('複数セッションをまたいで最も早い開始と最も遅い終了を返す', () => {
    const morning = makeSession({
      id: 's1',
      times: [{ startTime: '2026-05-20T09:15:00', endTime: '2026-05-20T11:00:00' }],
    })
    const evening = makeSession({
      id: 's2',
      times: [{ startTime: '2026-05-20T13:00:00', endTime: '2026-05-20T18:30:00' }],
    })
    // 並び順に依存せず同じ結果になること
    expect(dayTimeRange([evening, morning])).toEqual({ start: '09:15', end: '18:30' })
  })

  it('1セッションの複数区間も範囲に含める', () => {
    const multi = makeSession({
      times: [
        { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
        { startTime: '2026-05-20T14:00:00', endTime: '2026-05-20T15:30:00' },
      ],
    })
    expect(dayTimeRange([multi])).toEqual({ start: '09:00', end: '15:30' })
  })

  it('稼働中の区間があると終了は null になる', () => {
    const running = makeSession({
      times: [
        { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
        { startTime: '2026-05-20T11:00:00', endTime: null },
      ],
    })
    expect(dayTimeRange([running])).toEqual({ start: '09:00', end: null })
  })

  it('セッションが無ければ null', () => {
    expect(dayTimeRange([])).toBeNull()
  })

  it('区間を持たない手動追加セッションだけなら null', () => {
    expect(dayTimeRange([makeSession({ times: [] })])).toBeNull()
  })
})

describe('totalMinutesOf', () => {
  it('単一区間の分を返す', () => {
    expect(totalMinutesOf([
      { startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:45:00' },
    ])).toBe(45)
  })

  it('複数区間を合算する', () => {
    expect(totalMinutesOf([
      { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
      { startTime: '2026-05-20T13:00:00', endTime: '2026-05-20T14:30:00' },
    ])).toBe(150)
  })

  it('稼働中の区間は合計に含めない', () => {
    expect(totalMinutesOf([
      { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
      { startTime: '2026-05-20T11:00:00', endTime: null },
    ])).toBe(60)
  })

  it('区間が無ければ 0', () => {
    expect(totalMinutesOf([])).toBe(0)
  })

  it('すべて稼働中なら 0', () => {
    expect(totalMinutesOf([
      { startTime: '2026-05-20T11:00:00', endTime: null },
    ])).toBe(0)
  })

  it('秒は四捨五入する', () => {
    // 90秒 → 1.5分 → 2分
    expect(totalMinutesOf([
      { startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:01:30' },
    ])).toBe(2)
  })

  it('1分未満でも完了区間があれば最低1分', () => {
    expect(totalMinutesOf([
      { startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:00:10' },
    ])).toBe(1)
  })
})

describe('hasReliableTimes', () => {
  it('区間が無ければ false', () => {
    expect(hasReliableTimes(makeSession({ times: [], totalTime: 45 }))).toBe(false)
  })

  it('合計が totalTime と一致すれば true', () => {
    expect(hasReliableTimes(makeSession({
      times: [{ startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:30:00' }],
      totalTime: 30,
    }))).toBe(true)
  })

  it('合計が totalTime と食い違えば false', () => {
    expect(hasReliableTimes(makeSession({
      times: [{ startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:01:00' }],
      totalTime: 30,
    }))).toBe(false)
  })

  it('稼働中の区間を持つセッションは食い違っていても true', () => {
    expect(hasReliableTimes(makeSession({
      times: [
        { startTime: '2026-05-20T10:00:00', endTime: '2026-05-20T10:30:00' },
        { startTime: '2026-05-20T11:00:00', endTime: null },
      ],
      totalTime: 30,
    }))).toBe(true)
  })
})
