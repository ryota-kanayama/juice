import { describe, it, expect } from 'vitest'
import {
  toIntervalDrafts,
  toTimeIntervals,
  isValidDrafts,
  draftMinutes,
  initialIntervalDraft,
} from './intervalDraft'

describe('toIntervalDrafts', () => {
  it('完了区間を HH:mm のドラフトに変換する', () => {
    expect(toIntervalDrafts([
      { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:30:00' },
    ])).toEqual([{ start: '09:00', end: '10:30', running: false }])
  })

  it('稼働中の区間は end が空で running が true', () => {
    expect(toIntervalDrafts([
      { startTime: '2026-05-20T11:00:00', endTime: null },
    ])).toEqual([{ start: '11:00', end: '', running: true }])
  })

  it('区間が無ければ空配列', () => {
    expect(toIntervalDrafts([])).toEqual([])
  })
})

describe('toTimeIntervals', () => {
  it('日付と結合して TimeInterval にする', () => {
    expect(toTimeIntervals(
      [{ start: '09:00', end: '10:30', running: false }],
      '2026-05-20',
    )).toEqual([
      { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:30:00' },
    ])
  })

  it('稼働中は endTime が null', () => {
    expect(toTimeIntervals(
      [{ start: '11:00', end: '', running: true }],
      '2026-05-20',
    )).toEqual([
      { startTime: '2026-05-20T11:00:00', endTime: null },
    ])
  })

  it('複数区間を順に変換する', () => {
    expect(toTimeIntervals(
      [
        { start: '09:00', end: '10:00', running: false },
        { start: '13:00', end: '14:00', running: false },
      ],
      '2026-05-20',
    )).toHaveLength(2)
  })
})

describe('isValidDrafts', () => {
  it('開始と終了が揃っていれば true', () => {
    expect(isValidDrafts([{ start: '09:00', end: '10:00', running: false }])).toBe(true)
  })

  it('区間が0個なら false', () => {
    expect(isValidDrafts([])).toBe(false)
  })

  it('開始が空なら false', () => {
    expect(isValidDrafts([{ start: '', end: '10:00', running: false }])).toBe(false)
  })

  it('終了が空なら false', () => {
    expect(isValidDrafts([{ start: '09:00', end: '', running: false }])).toBe(false)
  })

  it('終了が開始より前なら false', () => {
    expect(isValidDrafts([{ start: '10:00', end: '09:00', running: false }])).toBe(false)
  })

  it('終了と開始が同じなら false', () => {
    expect(isValidDrafts([{ start: '10:00', end: '10:00', running: false }])).toBe(false)
  })

  it('稼働中の区間は終了が空でも true', () => {
    expect(isValidDrafts([{ start: '11:00', end: '', running: true }])).toBe(true)
  })

  it('1つでも不正なら false', () => {
    expect(isValidDrafts([
      { start: '09:00', end: '10:00', running: false },
      { start: '13:00', end: '', running: false },
    ])).toBe(false)
  })

  it('区間が重なっていても true（並行作業を許容する）', () => {
    expect(isValidDrafts([
      { start: '09:00', end: '11:00', running: false },
      { start: '10:00', end: '12:00', running: false },
    ])).toBe(true)
  })
})

describe('draftMinutes', () => {
  it('完了区間の合計分を返す', () => {
    expect(draftMinutes([
      { start: '09:00', end: '10:30', running: false },
      { start: '13:00', end: '13:30', running: false },
    ])).toBe(120)
  })

  it('稼働中の区間は含めない', () => {
    expect(draftMinutes([
      { start: '09:00', end: '10:00', running: false },
      { start: '11:00', end: '', running: true },
    ])).toBe(60)
  })

  it('不正な行は無視する', () => {
    expect(draftMinutes([
      { start: '09:00', end: '10:00', running: false },
      { start: '', end: '', running: false },
    ])).toBe(60)
  })

  it('空なら 0', () => {
    expect(draftMinutes([])).toBe(0)
  })
})

describe('initialIntervalDraft', () => {
  it('その日の最後の終了時刻を開始に入れる', () => {
    expect(initialIntervalDraft([
      { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
      { startTime: '2026-05-20T13:00:00', endTime: '2026-05-20T14:30:00' },
    ], '08:30')).toEqual({ start: '14:30', end: '', running: false })
  })

  it('区間の並び順に依存しない', () => {
    expect(initialIntervalDraft([
      { startTime: '2026-05-20T13:00:00', endTime: '2026-05-20T14:30:00' },
      { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
    ], null).start).toBe('14:30')
  })

  it('稼働中の区間は終了が無いので無視する', () => {
    expect(initialIntervalDraft([
      { startTime: '2026-05-20T09:00:00', endTime: '2026-05-20T10:00:00' },
      { startTime: '2026-05-20T13:00:00', endTime: null },
    ], null).start).toBe('10:00')
  })

  it('区間が無ければ勤務開始時刻を使う', () => {
    expect(initialIntervalDraft([], '08:30')).toEqual({ start: '08:30', end: '', running: false })
  })

  it('区間も勤務開始時刻も無ければ空', () => {
    expect(initialIntervalDraft([], null)).toEqual({ start: '', end: '', running: false })
  })
})
