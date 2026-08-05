import { describe, it, expect } from 'vitest'
import { startOfWeek, weekDates, formatPeriod, addDays } from './calendarRange'

describe('addDays', () => {
  it('日をまたいで加算する', () => {
    expect(addDays('2026-08-06', 1)).toBe('2026-08-07')
  })

  it('月をまたいで加算する', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('負の値で減算する', () => {
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('年をまたぐ', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('startOfWeek', () => {
  it('木曜日を渡すとその週の日曜日を返す', () => {
    // 2026-08-06 は木曜、同じ週の日曜は 2026-08-02
    expect(startOfWeek('2026-08-06')).toBe('2026-08-02')
  })

  it('日曜日を渡すとその日を返す', () => {
    expect(startOfWeek('2026-08-02')).toBe('2026-08-02')
  })

  it('土曜日を渡すと6日前の日曜を返す', () => {
    expect(startOfWeek('2026-08-08')).toBe('2026-08-02')
  })

  it('月をまたぐ週でも正しい日曜を返す', () => {
    // 2026-09-01 は火曜、同じ週の日曜は 2026-08-30
    expect(startOfWeek('2026-09-01')).toBe('2026-08-30')
  })
})

describe('weekDates', () => {
  it('日曜始まり土曜終わりの7日を返す', () => {
    expect(weekDates('2026-08-06')).toEqual([
      '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08',
    ])
  })

  it('月をまたぐ週も連続した7日を返す', () => {
    expect(weekDates('2026-09-01')).toEqual([
      '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
      '2026-09-03', '2026-09-04', '2026-09-05',
    ])
  })
})

describe('formatPeriod', () => {
  it('単一月なら「YYYY年M月」', () => {
    expect(formatPeriod(['2026-08-02', '2026-08-08'])).toBe('2026年8月')
  })

  it('月をまたぐと「YYYY年M月 – M月」', () => {
    expect(formatPeriod(['2026-08-30', '2026-09-05'])).toBe('2026年8月 – 9月')
  })

  it('年をまたぐと両方の年を出す', () => {
    expect(formatPeriod(['2026-12-27', '2027-01-02'])).toBe('2026年12月 – 2027年1月')
  })

  it('1日だけでも単一月として扱う', () => {
    expect(formatPeriod(['2026-08-06'])).toBe('2026年8月')
  })

  it('空配列は空文字', () => {
    expect(formatPeriod([])).toBe('')
  })
})
