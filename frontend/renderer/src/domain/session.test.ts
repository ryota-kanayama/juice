import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applySessionEdit,
  createManualSession,
  appendRunningInterval,
  hasRunningInterval,
  mergeRunningSessions,
  dayTimeRange,
  totalMinutesOf,
  hasReliableTimes,
  type SessionEdit,
} from './session'
import type { Session } from '../types/session'
import { JUICE_COLOR_KEYS } from './colors'
import { interval, makeSession } from '../test/factories'

// 2026-05-20 12:00:00 ローカル時刻を Date.now の基準にする
const NOW_MS = new Date('2026-05-20T12:00:00').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW_MS)
})

afterEach(() => {
  vi.useRealTimers()
})

const manualParams = (overrides: Partial<Parameters<typeof createManualSession>[0]> = {}) => ({
  name: '設計',
  projectCode: '',
  workCategory: '',
  times: [interval('2026-05-20T09:00:00', '2026-05-20T09:30:00')],
  ...overrides,
})

const edit = (overrides: Partial<SessionEdit> = {}): SessionEdit => ({
  name: '作業A',
  projectCode: 'P001',
  workCategory: '開発',
  times: [interval('2026-05-20T10:00:00', '2026-05-20T10:30:00')],
  totalMinutes: null,
  ...overrides,
})

describe('createManualSession', () => {
  it('区間から totalTime を算出する', () => {
    const params = manualParams({ times: [interval('2026-05-20T09:00:00', '2026-05-20T10:30:00')] })

    const session = createManualSession(params)

    expect(session.totalTime).toBe(90)
  })

  it('渡した区間をそのまま持つ', () => {
    const times = [interval('2026-05-20T09:00:00', '2026-05-20T10:30:00')]

    const session = createManualSession(manualParams({ times }))

    expect(session.times).toEqual(times)
  })

  it('名前・PJコード・作業区分を渡したとおりに持つ', () => {
    const params = manualParams({ name: '設計', projectCode: 'P001', workCategory: '開発' })

    const session = createManualSession(params)

    expect(session).toMatchObject({ name: '設計', projectCode: 'P001', workCategory: '開発' })
  })

  it('date は最初の区間の日付から決まる', () => {
    const params = manualParams({ times: [interval('2026-05-18T09:00:00', '2026-05-18T09:30:00')] })

    const session = createManualSession(params)

    expect(session.date).toBe('2026-05-18')
  })

  it('複数区間を合算する', () => {
    const params = manualParams({
      times: [
        interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
        interval('2026-05-20T13:00:00', '2026-05-20T14:00:00'),
      ],
    })

    const session = createManualSession(params)

    expect(session.totalTime).toBe(120)
  })

  it('id と taskId が同じ値になる', () => {
    const session = createManualSession(manualParams())

    expect(session.taskId).toBe(session.id)
  })

  it('呼ぶたびに別の id を振る', () => {
    const first = createManualSession(manualParams())

    const second = createManualSession(manualParams())

    expect(second.id).not.toBe(first.id)
  })

  it('色はパレットから選ばれる', () => {
    const session = createManualSession(manualParams())

    expect(JUICE_COLOR_KEYS).toContain(session.color)
  })

  it('telework を渡すと workLocation が付く', () => {
    const session = createManualSession(manualParams({ workLocation: 'telework' }))

    expect(session.workLocation).toBe('telework')
  })

  it('office を渡すと workLocation は付かない', () => {
    const session = createManualSession(manualParams({ workLocation: 'office' }))

    expect(session).not.toHaveProperty('workLocation')
  })
})

describe('applySessionEdit', () => {
  it('名前・PJコード・作業区分を差し替える', () => {
    const changes = edit({ name: '設計レビュー', projectCode: 'P002', workCategory: 'レビュー' })

    const { session } = applySessionEdit(makeSession(), changes)

    expect(session).toMatchObject({ name: '設計レビュー', projectCode: 'P002', workCategory: 'レビュー' })
  })

  it('区間を差し替える', () => {
    const times = [interval('2026-05-20T10:00:00', '2026-05-20T12:00:00')]

    const { session } = applySessionEdit(makeSession(), edit({ times }))

    expect(session.times).toEqual(times)
  })

  it('区間を差し替えると totalTime も追従する', () => {
    const times = [interval('2026-05-20T10:00:00', '2026-05-20T12:00:00')]

    const { session } = applySessionEdit(makeSession(), edit({ times }))

    expect(session.totalTime).toBe(120)
  })

  it('区間を増やすと合計に反映される', () => {
    const times = [
      interval('2026-05-20T10:00:00', '2026-05-20T11:00:00'),
      interval('2026-05-20T13:00:00', '2026-05-20T13:30:00'),
    ]

    const { session } = applySessionEdit(makeSession(), edit({ times }))

    expect(session.totalTime).toBe(90)
  })

  it('1分未満の区間だけに縮めても totalTime は 1 になる', () => {
    const times = [interval('2026-05-20T10:00:00', '2026-05-20T10:00:10')]

    const { session } = applySessionEdit(makeSession(), edit({ times }))

    expect(session.totalTime).toBe(1)
  })

  describe('times が null（時刻を持たないレガシー記録）', () => {
    const legacy = makeSession({ times: [], totalTime: 45 })

    it('totalMinutes で totalTime を差し替える', () => {
      const { session } = applySessionEdit(legacy, edit({ times: null, totalMinutes: 90 }))

      expect(session.totalTime).toBe(90)
    })

    it('区間は空のまま変えない', () => {
      const { session } = applySessionEdit(legacy, edit({ times: null, totalMinutes: 90 }))

      expect(session.times).toEqual([])
    })

    it('totalMinutes が 1 なら差し替える（下限ちょうど）', () => {
      const { session } = applySessionEdit(legacy, edit({ times: null, totalMinutes: 1 }))

      expect(session.totalTime).toBe(1)
    })

    it('totalMinutes が 0 以下なら totalTime を変えない', () => {
      const { session } = applySessionEdit(legacy, edit({ times: null, totalMinutes: 0 }))

      expect(session.totalTime).toBe(45)
    })

    it('totalMinutes が null なら totalTime を変えない', () => {
      const { session } = applySessionEdit(legacy, edit({ times: null, totalMinutes: null }))

      expect(session.totalTime).toBe(45)
    })

    it('名前などの差し替えは行う', () => {
      const { session } = applySessionEdit(legacy, edit({ name: '別名', times: null, totalMinutes: null }))

      expect(session.name).toBe('別名')
    })
  })

  describe('稼働中の区間を含むセッション', () => {
    const running = makeSession({
      times: [
        interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
        interval('2026-05-20T11:00:00', null),
      ],
      totalTime: 60,
    })

    it('稼働中の区間は totalTime に含めない', () => {
      const { session } = applySessionEdit(running, edit({ times: running.times }))

      expect(session.totalTime).toBe(60)
    })

    it('稼働中の区間は稼働中のまま残す', () => {
      const { session } = applySessionEdit(running, edit({ times: running.times }))

      expect(session.times[1].endTime).toBeNull()
    })

    it('1分未満の完了区間と稼働中の区間が同居するとき totalTime は 1 になる', () => {
      const times = [
        interval('2026-05-20T09:00:00', '2026-05-20T09:00:10'),
        interval('2026-05-20T11:00:00', null),
      ]

      const { session } = applySessionEdit(makeSession({ times, totalTime: 0 }), edit({ times }))

      expect(session.totalTime).toBe(1)
    })

    it('稼働中の区間だけなら totalTime は 0 になる', () => {
      const times = [interval('2026-05-20T11:00:00', null)]

      const { session } = applySessionEdit(makeSession({ times, totalTime: 0 }), edit({ times }))

      expect(session.totalTime).toBe(0)
    })
  })

  describe('adjustedStartMs', () => {
    const runningOnly = makeSession({ times: [interval('2026-05-20T11:00:00', null)], totalTime: 0 })

    it('稼働中区間の開始を変えると、新しい開始時刻を返す', () => {
      const times = [interval('2026-05-20T10:30:00', null)]

      const { adjustedStartMs } = applySessionEdit(runningOnly, edit({ times }))

      expect(adjustedStartMs).toBe(new Date('2026-05-20T10:30:00').getTime())
    })

    it('稼働中区間の開始が変わらなければ返さない', () => {
      const times = [interval('2026-05-20T11:00:00', null)]

      const { adjustedStartMs } = applySessionEdit(runningOnly, edit({ times }))

      expect(adjustedStartMs).toBeUndefined()
    })

    it('停止済みセッションでは返さない', () => {
      const times = [interval('2026-05-20T09:00:00', '2026-05-20T10:00:00')]

      const { adjustedStartMs } = applySessionEdit(makeSession(), edit({ times }))

      expect(adjustedStartMs).toBeUndefined()
    })

    it('編集で稼働中区間を消したら返さない', () => {
      const times = [interval('2026-05-20T09:00:00', '2026-05-20T10:00:00')]

      const { adjustedStartMs } = applySessionEdit(runningOnly, edit({ times }))

      expect(adjustedStartMs).toBeUndefined()
    })
  })

  it('元の session は書き換えない', () => {
    const original = makeSession({ name: '作業A', totalTime: 30 })
    const before = structuredClone(original)

    applySessionEdit(original, edit({
      name: '別名',
      times: [interval('2026-05-20T09:00:00', '2026-05-20T12:00:00')],
    }))

    expect(original).toEqual(before)
  })
})

describe('appendRunningInterval', () => {
  it('現在時刻を開始とする稼働中の区間を末尾に追加する', () => {
    const session = makeSession({ times: [interval('2026-05-20T10:00:00', '2026-05-20T10:30:00')] })

    const updated = appendRunningInterval(session)

    expect(updated.times).toEqual([
      interval('2026-05-20T10:00:00', '2026-05-20T10:30:00'),
      interval('2026-05-20T12:00:00', null),
    ])
  })

  it('元の session は書き換えない', () => {
    const session = makeSession({ times: [interval('2026-05-20T10:00:00', '2026-05-20T10:30:00')] })

    appendRunningInterval(session)

    expect(session.times).toHaveLength(1)
  })
})

describe('hasRunningInterval', () => {
  it('endTime=null の区間があれば true', () => {
    const session = makeSession({ times: [interval('2026-05-20T10:00:00', null)] })

    const result = hasRunningInterval(session)

    expect(result).toBe(true)
  })

  it('全区間が完了済みなら false', () => {
    const session = makeSession({ times: [interval('2026-05-20T10:00:00', '2026-05-20T10:30:00')] })

    const result = hasRunningInterval(session)

    expect(result).toBe(false)
  })

  it('区間が空なら false', () => {
    const session = makeSession({ times: [] })

    const result = hasRunningInterval(session)

    expect(result).toBe(false)
  })
})

describe('dayTimeRange', () => {
  it('区間が1つならその開始と終了を返す', () => {
    const session = makeSession({ times: [interval('2026-05-20T10:00:00', '2026-05-20T10:30:00')] })

    const range = dayTimeRange([session])

    expect(range).toEqual({ start: '10:00', end: '10:30' })
  })

  it('複数セッションをまたいで最も早い開始と最も遅い終了を返す（並び順に依存しない）', () => {
    const morning = makeSession({ id: 's1', times: [interval('2026-05-20T09:15:00', '2026-05-20T11:00:00')] })
    const evening = makeSession({ id: 's2', times: [interval('2026-05-20T13:00:00', '2026-05-20T18:30:00')] })

    const range = dayTimeRange([evening, morning])

    expect(range).toEqual({ start: '09:15', end: '18:30' })
  })

  it('1セッションの複数区間も範囲に含める', () => {
    const multi = makeSession({
      times: [
        interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
        interval('2026-05-20T14:00:00', '2026-05-20T15:30:00'),
      ],
    })

    const range = dayTimeRange([multi])

    expect(range).toEqual({ start: '09:00', end: '15:30' })
  })

  it('稼働中の区間があると終了は null になる', () => {
    const running = makeSession({
      times: [
        interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
        interval('2026-05-20T11:00:00', null),
      ],
    })

    const range = dayTimeRange([running])

    expect(range).toEqual({ start: '09:00', end: null })
  })

  it('セッションが無ければ null', () => {
    const range = dayTimeRange([])

    expect(range).toBeNull()
  })

  it('区間を持たない手動追加セッションだけなら null', () => {
    const range = dayTimeRange([makeSession({ times: [] })])

    expect(range).toBeNull()
  })
})

describe('totalMinutesOf', () => {
  it('単一区間の分を返す', () => {
    const times = [interval('2026-05-20T10:00:00', '2026-05-20T10:45:00')]

    const minutes = totalMinutesOf(times)

    expect(minutes).toBe(45)
  })

  it('複数区間を合算する', () => {
    const times = [
      interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
      interval('2026-05-20T13:00:00', '2026-05-20T14:30:00'),
    ]

    const minutes = totalMinutesOf(times)

    expect(minutes).toBe(150)
  })

  it('稼働中の区間は合計に含めない', () => {
    const times = [
      interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
      interval('2026-05-20T11:00:00', null),
    ]

    const minutes = totalMinutesOf(times)

    expect(minutes).toBe(60)
  })

  it('区間が無ければ 0', () => {
    const minutes = totalMinutesOf([])

    expect(minutes).toBe(0)
  })

  it('すべて稼働中なら 0', () => {
    const minutes = totalMinutesOf([interval('2026-05-20T11:00:00', null)])

    expect(minutes).toBe(0)
  })

  it('30秒以上の端数は切り上げる（90秒 → 2分）', () => {
    const times = [interval('2026-05-20T10:00:00', '2026-05-20T10:01:30')]

    const minutes = totalMinutesOf(times)

    expect(minutes).toBe(2)
  })

  it('30秒未満の端数は切り捨てる（80秒 → 1分）', () => {
    const times = [interval('2026-05-20T10:00:00', '2026-05-20T10:01:20')]

    const minutes = totalMinutesOf(times)

    expect(minutes).toBe(1)
  })

  it('区間ごとではなく合計してから丸める（90秒 × 2 → 3分）', () => {
    const times = [
      interval('2026-05-20T10:00:00', '2026-05-20T10:01:30'),
      interval('2026-05-20T11:00:00', '2026-05-20T11:01:30'),
    ]

    const minutes = totalMinutesOf(times)

    expect(minutes).toBe(3)
  })

  it('1分未満でも完了区間があれば最低1分', () => {
    const times = [interval('2026-05-20T10:00:00', '2026-05-20T10:00:10')]

    const minutes = totalMinutesOf(times)

    expect(minutes).toBe(1)
  })
})

describe('hasReliableTimes', () => {
  it('区間が無ければ false', () => {
    const session = makeSession({ times: [], totalTime: 45 })

    const result = hasReliableTimes(session)

    expect(result).toBe(false)
  })

  it('合計が totalTime と一致すれば true', () => {
    const session = makeSession({
      times: [interval('2026-05-20T10:00:00', '2026-05-20T10:30:00')],
      totalTime: 30,
    })

    const result = hasReliableTimes(session)

    expect(result).toBe(true)
  })

  it('合計が totalTime と食い違えば false', () => {
    const session = makeSession({
      times: [interval('2026-05-20T10:00:00', '2026-05-20T10:01:00')],
      totalTime: 30,
    })

    const result = hasReliableTimes(session)

    expect(result).toBe(false)
  })

  it('稼働中の区間を持つセッションは食い違っていても true', () => {
    const session = makeSession({
      times: [
        interval('2026-05-20T10:00:00', '2026-05-20T10:30:00'),
        interval('2026-05-20T11:00:00', null),
      ],
      totalTime: 30,
    })

    const result = hasReliableTimes(session)

    expect(result).toBe(true)
  })
})

describe('mergeRunningSessions', () => {
  const stopped = (id: string): Session => makeSession({
    id,
    taskId: id,
    name: `作業${id}`,
    times: [interval('2026-08-09T10:00:00', '2026-08-09T11:00:00')],
    date: '2026-08-09',
    totalTime: 60,
  })
  const running = (id: string): Session => ({
    ...stopped(id),
    times: [interval('2026-08-09T13:00:00', null)],
  })

  it('ディスクに無い稼働中の作業を残す', () => {
    const merged = mergeRunningSessions([stopped('a')], [stopped('a'), running('b')])

    expect(merged.map(s => s.id)).toEqual(['a', 'b'])
  })

  it('稼働中の作業は同じ id があっても手元を優先する', () => {
    // ディスクには停止済みとして入っているが、手元では区間が稼働中
    const merged = mergeRunningSessions([stopped('a')], [running('a')])

    expect(merged).toEqual([running('a')])
  })

  it('停止済みの作業はディスクを優先する', () => {
    const fromDisk = { ...stopped('a'), name: 'ディスクで直した名前' }

    const merged = mergeRunningSessions([fromDisk], [stopped('a')])

    expect(merged).toEqual([fromDisk])
  })

  it('手元に稼働中が無ければディスクそのまま', () => {
    const disk = [stopped('a'), stopped('b')]

    const merged = mergeRunningSessions(disk, [stopped('a')])

    expect(merged).toEqual(disk)
  })

  it('同じ稼働中の作業が二重に入らない', () => {
    const merged = mergeRunningSessions([stopped('a')], [running('a'), running('a')])

    expect(merged).toHaveLength(1)
  })

  it('どちらも空なら空', () => {
    const merged = mergeRunningSessions([], [])

    expect(merged).toEqual([])
  })

  it('ディスクが空でも手元の稼働中は残る', () => {
    const merged = mergeRunningSessions([], [running('b')])

    expect(merged).toEqual([running('b')])
  })
})
