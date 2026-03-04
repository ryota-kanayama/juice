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
  it('基本フォーマットで文字列を生成する', () => {
    const sessions = [makeSession()]
    const result = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(result).toBe('勤怠\n08:37 18:40 60\nZZ テスト作業 設計 180')
  })

  it('複数タスクを登場順に並べる', () => {
    const sessions = [
      makeSession({ id: 'a', taskId: 't1', name: '社内MTG', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 180 }),
      makeSession({ id: 'b', taskId: 't2', name: '1on1', projectCode: 'ZZ', workCategory: '打合せ', totalTime: 60 }),
    ]
    const result = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(result).toBe('勤怠\n08:37 18:40 60\nZZ 社内MTG 打合せ 180\nZZ 1on1 打合せ 60')
  })

  it('totalTimeが正しく反映される', () => {
    const sessions = [
      makeSession({ totalTime: 120 }),
    ]
    const result = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(result).toBe('勤怠\n08:37 18:40 60\nZZ テスト作業 設計 120')
  })

  it('totalTimeが0のセッションはスキップする', () => {
    const sessions = [
      makeSession({ totalTime: 0 }),
    ]
    const result = buildAttendanceText(sessions, '08:37', '18:40', 60)
    expect(result).toBe('勤怠\n08:37 18:40 60')
  })

  it('workStart/workEndがnullの場合は空文字にする', () => {
    const sessions = [makeSession()]
    const result = buildAttendanceText(sessions, null, null, 60)
    expect(result).toBe('勤怠\n  60\nZZ テスト作業 設計 180')
  })
})
