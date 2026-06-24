import { describe, it, expect } from 'vitest'
import { buildAttendanceText, calcBreakMinutes } from './attendance'
import type { Session } from '../types/session'

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'id1',
  taskId: 'task1',
  name: 'テスト作業',
  projectCode: 'ZZ',
  workCategory: '設計',
  times: [{ startTime: '2026-02-26T10:00:00', endTime: '2026-02-26T13:00:00' }],
  date: '2026-02-26',
  color: '#FF9500',
  totalTime: 180,
  ...overrides,
})

describe('buildAttendanceText', () => {
  it('基本フォーマットで文字列を生成する（差分が最後のタスクに加算される）', () => {
    // 勤務: 08:37〜18:40 = 603分, 休憩60分 → 実労働543分
    // タイマー合計: 180分, 差分: 363分 → 180+363=543
    const sessions = [makeSession()]
    const { text, overageMinutes } = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(text).toBe('勤怠\n08:37 18:40 60\nZZ テスト作業 設計 543')
    expect(overageMinutes).toBeNull()
  })

  it('名前の前後・中間の空白を全て除去して出力する', () => {
    const sessions = [makeSession({ name: '  テ スト　作業  ' })]
    const { text } = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(text).toBe('勤怠\n08:37 18:40 60\nZZ テスト作業 設計 543')
  })

  it('複数タスクの場合、差分は最後のタスクにのみ加算される', () => {
    // 勤務: 08:37〜18:40 = 603分, 休憩60分 → 実労働543分
    // タイマー合計: 180+60=240分, 差分: 303分 → 最後のタスク: 60+303=363
    const sessions = [
      makeSession({ id: 'a', taskId: 't1', name: '社内MTG', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 180 }),
      makeSession({ id: 'b', taskId: 't2', name: '1on1', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 60 }),
    ]
    const { text, overageMinutes } = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(text).toBe('勤怠\n08:37 18:40 60\nZZ 社内MTG 打合せ 180\nZZ 1on1 打合せ 363')
    expect(overageMinutes).toBeNull()
  })

  it('タイマー合計が実労働時間と同じなら変化しない（差分0）', () => {
    // 勤務: 09:00〜12:00 = 180分, 休憩0分 → 実労働180分
    // タイマー合計: 180分, 差分: 0分
    const sessions = [makeSession()]
    const { text, overageMinutes } = buildAttendanceText(sessions, '09:00', '12:00', 0)
    expect(text).toBe('勤怠\n09:00 12:00 0\nZZ テスト作業 設計 180')
    expect(overageMinutes).toBeNull()
  })

  it('タイマー合計が実労働時間を超える場合は自動調整せず overageMinutes を返す', () => {
    // 勤務: 09:00〜12:00 = 180分, 休憩0分 → 実労働180分
    // タイマー合計: 200分, 超過: 20分
    const sessions = [makeSession({ totalTime: 200 })]
    const { text, overageMinutes } = buildAttendanceText(sessions, '09:00', '12:00', 0)
    expect(text).toBe('勤怠\n09:00 12:00 0\nZZ テスト作業 設計 200')
    expect(overageMinutes).toBe(20)
  })

  it('複数タスクで超過している場合もすべてのタスクがそのまま残る', () => {
    // 勤務: 09:00〜12:00 = 180分, 休憩30分 → 実労働150分
    // タイマー合計: 180+60=240分, 超過: 90分 → 全タスク維持
    const sessions = [
      makeSession({ id: 'a', taskId: 't1', name: '社内MTG', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 180 }),
      makeSession({ id: 'b', taskId: 't2', name: '1on1', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 60 }),
    ]
    const { text, overageMinutes } = buildAttendanceText(sessions, '09:00', '12:00', 30)
    expect(text).toBe('勤怠\n09:00 12:00 30\nZZ 社内MTG 打合せ 180\nZZ 1on1 打合せ 60')
    expect(overageMinutes).toBe(90)
  })

  it('totalTimeが0のセッションはスキップする', () => {
    const sessions = [
      makeSession({ totalTime: 0 }),
    ]
    const { text, overageMinutes } = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(text).toBe('勤怠\n08:37 18:40 60')
    expect(overageMinutes).toBeNull()
  })

  it('workStart/workEndがnullの場合は差分加算しない', () => {
    const sessions = [makeSession()]
    const { text, overageMinutes } = buildAttendanceText(sessions, null, null, 60)
    expect(text).toBe('勤怠\n  60\nZZ テスト作業 設計 180')
    expect(overageMinutes).toBeNull()
  })
})

describe('calcBreakMinutes', () => {
  it('12:00〜13:00 は 60', () => {
    expect(calcBreakMinutes('12:00', '13:00')).toBe(60)
  })
  it('12:30〜13:15 は 45', () => {
    expect(calcBreakMinutes('12:30', '13:15')).toBe(45)
  })
  it('breakEnd が null なら 60（フォールバック）', () => {
    expect(calcBreakMinutes('12:00', null)).toBe(60)
  })
  it('breakStart が null なら 60（フォールバック）', () => {
    expect(calcBreakMinutes(null, '13:00')).toBe(60)
  })
  it('終了が開始以前なら 60（フォールバック）', () => {
    expect(calcBreakMinutes('13:00', '12:00')).toBe(60)
  })
  it('両方 null なら 60', () => {
    expect(calcBreakMinutes(null, null)).toBe(60)
  })
})
