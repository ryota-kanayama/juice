import { describe, it, expect } from 'vitest'
import {
  toIntervalDrafts,
  toTimeIntervals,
  isValidDrafts,
  draftMinutes,
  initialIntervalDraft,
  type IntervalDraft,
} from './intervalDraft'
import { interval } from '../test/factories'

const draft = (start: string, end: string, running = false): IntervalDraft => ({ start, end, running })

describe('toIntervalDrafts', () => {
  it('完了区間を HH:mm のドラフトに変換する', () => {
    const times = [interval('2026-05-20T09:00:00', '2026-05-20T10:30:00')]

    const drafts = toIntervalDrafts(times)

    expect(drafts).toEqual([draft('09:00', '10:30')])
  })

  it('稼働中の区間は end が空で running が true', () => {
    const times = [interval('2026-05-20T11:00:00', null)]

    const drafts = toIntervalDrafts(times)

    expect(drafts).toEqual([draft('11:00', '', true)])
  })

  it('区間が無ければ空配列', () => {
    const drafts = toIntervalDrafts([])

    expect(drafts).toEqual([])
  })
})

describe('toTimeIntervals', () => {
  it('日付と結合して TimeInterval にする', () => {
    const drafts = [draft('09:00', '10:30')]

    const times = toTimeIntervals(drafts, '2026-05-20')

    expect(times).toEqual([interval('2026-05-20T09:00:00', '2026-05-20T10:30:00')])
  })

  it('稼働中は endTime が null', () => {
    const drafts = [draft('11:00', '', true)]

    const times = toTimeIntervals(drafts, '2026-05-20')

    expect(times).toEqual([interval('2026-05-20T11:00:00', null)])
  })

  it('複数区間を順序を保って変換する', () => {
    const drafts = [draft('09:00', '10:00'), draft('13:00', '14:00')]

    const times = toTimeIntervals(drafts, '2026-05-20')

    expect(times).toEqual([
      interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
      interval('2026-05-20T13:00:00', '2026-05-20T14:00:00'),
    ])
  })

  it('toIntervalDrafts と往復させると元に戻る', () => {
    const original = [
      interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
      interval('2026-05-20T11:00:00', null),
    ]

    const roundTrip = toTimeIntervals(toIntervalDrafts(original), '2026-05-20')

    expect(roundTrip).toEqual(original)
  })
})

describe('isValidDrafts', () => {
  it('開始と終了が揃っていれば true', () => {
    const valid = isValidDrafts([draft('09:00', '10:00')])

    expect(valid).toBe(true)
  })

  it('稼働中の区間は終了が空でも true', () => {
    const valid = isValidDrafts([draft('11:00', '', true)])

    expect(valid).toBe(true)
  })

  it('区間が重なっていても true（並行作業を許容する）', () => {
    const valid = isValidDrafts([draft('09:00', '11:00'), draft('10:00', '12:00')])

    expect(valid).toBe(true)
  })

  it('区間が0個なら false', () => {
    const valid = isValidDrafts([])

    expect(valid).toBe(false)
  })

  it.each([
    ['開始が空', draft('', '10:00')],
    ['終了が空', draft('09:00', '')],
    ['終了が開始より前', draft('10:00', '09:00')],
    ['終了と開始が同じ', draft('10:00', '10:00')],
    ['時が1桁', draft('9:00', '10:00')],
    ['時が24以上', draft('09:00', '24:00')],
    ['分が60以上', draft('09:60', '10:00')],
  ])('%s なら false', (_label, row) => {
    const valid = isValidDrafts([row])

    expect(valid).toBe(false)
  })

  it('稼働中でも開始が不正なら false', () => {
    const valid = isValidDrafts([draft('', '', true)])

    expect(valid).toBe(false)
  })

  it('1つでも不正なら false', () => {
    const valid = isValidDrafts([draft('09:00', '10:00'), draft('13:00', '')])

    expect(valid).toBe(false)
  })
})

describe('draftMinutes', () => {
  it('完了区間の合計分を返す', () => {
    const minutes = draftMinutes([draft('09:00', '10:30'), draft('13:00', '13:30')])

    expect(minutes).toBe(120)
  })

  it('稼働中の区間は含めない', () => {
    const minutes = draftMinutes([draft('09:00', '10:00'), draft('11:00', '', true)])

    expect(minutes).toBe(60)
  })

  it('空欄の行は無視する', () => {
    const minutes = draftMinutes([draft('09:00', '10:00'), draft('', '')])

    expect(minutes).toBe(60)
  })

  it('終了が開始以前の行は無視する', () => {
    const minutes = draftMinutes([draft('09:00', '10:00'), draft('12:00', '11:00')])

    expect(minutes).toBe(60)
  })

  it('空なら 0', () => {
    const minutes = draftMinutes([])

    expect(minutes).toBe(0)
  })
})

describe('initialIntervalDraft', () => {
  it('その日の最後の終了時刻を開始に入れ、終了は空にする', () => {
    const dayIntervals = [
      interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
      interval('2026-05-20T13:00:00', '2026-05-20T14:30:00'),
    ]

    const result = initialIntervalDraft(dayIntervals, '08:30')

    expect(result).toEqual(draft('14:30', ''))
  })

  it('区間の並び順に依存しない', () => {
    const dayIntervals = [
      interval('2026-05-20T13:00:00', '2026-05-20T14:30:00'),
      interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
    ]

    const result = initialIntervalDraft(dayIntervals, null)

    expect(result.start).toBe('14:30')
  })

  it('稼働中の区間は終了が無いので無視する', () => {
    const dayIntervals = [
      interval('2026-05-20T09:00:00', '2026-05-20T10:00:00'),
      interval('2026-05-20T13:00:00', null),
    ]

    const result = initialIntervalDraft(dayIntervals, null)

    expect(result.start).toBe('10:00')
  })

  it('区間が無ければ勤務開始時刻を使う', () => {
    const result = initialIntervalDraft([], '08:30')

    expect(result).toEqual(draft('08:30', ''))
  })

  it('区間も勤務開始時刻も無ければ空', () => {
    const result = initialIntervalDraft([], null)

    expect(result).toEqual(draft('', ''))
  })
})
