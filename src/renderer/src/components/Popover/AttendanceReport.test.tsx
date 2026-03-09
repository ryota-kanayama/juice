import { describe, it, expect } from 'vitest'
import { buildAttendanceText } from './AttendanceReport'
import type { Session } from '../../types/session'

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
    const result = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(result).toBe('勤怠\n08:37 18:40 60\nZZ テスト作業 設計 543')
  })

  it('複数タスクの場合、差分は最後のタスクにのみ加算される', () => {
    // 勤務: 08:37〜18:40 = 603分, 休憩60分 → 実労働543分
    // タイマー合計: 180+60=240分, 差分: 303分 → 最後のタスク: 60+303=363
    const sessions = [
      makeSession({ id: 'a', taskId: 't1', name: '社内MTG', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 180 }),
      makeSession({ id: 'b', taskId: 't2', name: '1on1', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 60 }),
    ]
    const result = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(result).toBe('勤怠\n08:37 18:40 60\nZZ 社内MTG 打合せ 180\nZZ 1on1 打合せ 363')
  })

  it('タイマー合計が実労働時間以上なら差分を加算しない', () => {
    // 勤務: 09:00〜12:00 = 180分, 休憩0分 → 実労働180分
    // タイマー合計: 180分, 差分: 0分
    const sessions = [makeSession()]
    const result = buildAttendanceText(sessions, '09:00', '12:00', 0)
    expect(result).toBe('勤怠\n09:00 12:00 0\nZZ テスト作業 設計 180')
  })

  it('totalTimeが0のセッションはスキップする', () => {
    const sessions = [
      makeSession({ totalTime: 0 }),
    ]
    const result = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(result).toBe('勤怠\n08:37 18:40 60')
  })

  it('workStart/workEndがnullの場合は差分加算しない', () => {
    const sessions = [makeSession()]
    const result = buildAttendanceText(sessions, null, null, 60)
    expect(result).toBe('勤怠\n  60\nZZ テスト作業 設計 180')
  })
})
