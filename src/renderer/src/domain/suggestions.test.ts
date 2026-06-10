import { describe, it, expect } from 'vitest'
import type { Session } from '../types/session'
import { buildSuggestions, previousYearMonth } from './suggestions'

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 'id-1',
    taskId: 'task-1',
    name: '作業',
    projectCode: '',
    workCategory: '',
    times: [],
    date: '2026-06-01',
    color: '#ff6b6b',
    totalTime: 30,
    ...overrides,
  }
}

describe('buildSuggestions', () => {
  it('作業名候補が新しい順に並び、PJコード・作業区分を保持する', () => {
    const sessions = [
      makeSession({
        id: 'a', name: '資料作成', projectCode: 'P001', workCategory: '設計',
        date: '2026-06-01',
        times: [{ startTime: '2026-06-01T10:00:00', endTime: '2026-06-01T11:00:00' }],
      }),
      makeSession({
        id: 'b', name: 'レビュー', projectCode: 'P002', workCategory: '会議',
        date: '2026-06-05',
        times: [{ startTime: '2026-06-05T10:00:00', endTime: '2026-06-05T11:00:00' }],
      }),
    ]
    const result = buildSuggestions(sessions)
    expect(result.names).toEqual([
      { name: 'レビュー', projectCode: 'P002', workCategory: '会議' },
      { name: '資料作成', projectCode: 'P001', workCategory: '設計' },
    ])
  })

  it('同名の作業は重複排除され、最新のセッションの値が使われる', () => {
    const sessions = [
      makeSession({
        id: 'a', name: '資料作成', projectCode: 'P001', workCategory: '設計',
        times: [{ startTime: '2026-06-01T10:00:00', endTime: '2026-06-01T11:00:00' }],
      }),
      makeSession({
        id: 'b', name: '資料作成', projectCode: 'P009', workCategory: '実装',
        times: [{ startTime: '2026-06-08T10:00:00', endTime: '2026-06-08T11:00:00' }],
      }),
    ]
    const result = buildSuggestions(sessions)
    expect(result.names).toEqual([
      { name: '資料作成', projectCode: 'P009', workCategory: '実装' },
    ])
  })

  it('PJコード・作業区分の候補は空値を除外して重複なく新しい順に並ぶ', () => {
    const sessions = [
      makeSession({
        id: 'a', name: 'タスクA', projectCode: 'P001', workCategory: '',
        times: [{ startTime: '2026-06-01T10:00:00', endTime: '2026-06-01T11:00:00' }],
      }),
      makeSession({
        id: 'b', name: 'タスクB', projectCode: '', workCategory: '会議',
        times: [{ startTime: '2026-06-03T10:00:00', endTime: '2026-06-03T11:00:00' }],
      }),
      makeSession({
        id: 'c', name: 'タスクC', projectCode: 'P002', workCategory: '会議',
        times: [{ startTime: '2026-06-05T10:00:00', endTime: '2026-06-05T11:00:00' }],
      }),
    ]
    const result = buildSuggestions(sessions)
    expect(result.projectCodes).toEqual(['P002', 'P001'])
    expect(result.workCategories).toEqual(['会議'])
  })

  it('times が空のセッション（手動追加）は date で新しさを比較する', () => {
    const sessions = [
      makeSession({ id: 'a', name: '手動タスク', date: '2026-06-09', times: [] }),
      makeSession({
        id: 'b', name: '通常タスク', date: '2026-06-01',
        times: [{ startTime: '2026-06-01T10:00:00', endTime: '2026-06-01T11:00:00' }],
      }),
    ]
    const result = buildSuggestions(sessions)
    expect(result.names[0].name).toBe('手動タスク')
  })

  it('名前が空白のみのセッションは候補に含めない', () => {
    const sessions = [makeSession({ id: 'a', name: '  ' })]
    expect(buildSuggestions(sessions).names).toEqual([])
  })
})

describe('previousYearMonth', () => {
  it('前月を返す', () => {
    expect(previousYearMonth('2026-06')).toBe('2026-05')
  })

  it('年をまたぐ', () => {
    expect(previousYearMonth('2026-01')).toBe('2025-12')
  })
})
