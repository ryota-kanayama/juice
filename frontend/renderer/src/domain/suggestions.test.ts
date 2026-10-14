import { describe, it, expect } from 'vitest'
import type { Session } from '../types/session'
import { buildSuggestions, previousYearMonth } from './suggestions'
import { interval, makeSession } from '../test/factories'

/** 指定日の 10:00 に始めたセッション。新しさの比較は最後の区間の開始時刻で行われる */
const startedOn = (date: string, overrides: Partial<Session> = {}): Session => makeSession({
  date,
  times: [interval(`${date}T10:00:00`, `${date}T11:00:00`)],
  projectCode: '',
  workCategory: '',
  ...overrides,
})

describe('buildSuggestions', () => {
  describe('作業名の候補', () => {
    it('新しい順に並ぶ', () => {
      const sessions = [
        startedOn('2026-06-01', { id: 'a', name: '資料作成' }),
        startedOn('2026-06-05', { id: 'b', name: 'レビュー' }),
      ]

      const { names } = buildSuggestions(sessions)

      expect(names.map(n => n.name)).toEqual(['レビュー', '資料作成'])
    })

    it('PJコード・作業区分を一緒に持つ', () => {
      const sessions = [startedOn('2026-06-01', { name: '資料作成', projectCode: 'P001', workCategory: '設計' })]

      const { names } = buildSuggestions(sessions)

      expect(names).toEqual([{ name: '資料作成', projectCode: 'P001', workCategory: '設計' }])
    })

    it('同名の作業は1件にまとめ、最新のセッションの PJコード・作業区分を使う', () => {
      const sessions = [
        startedOn('2026-06-01', { id: 'a', name: '資料作成', projectCode: 'P001', workCategory: '設計' }),
        startedOn('2026-06-08', { id: 'b', name: '資料作成', projectCode: 'P009', workCategory: '実装' }),
      ]

      const { names } = buildSuggestions(sessions)

      expect(names).toEqual([{ name: '資料作成', projectCode: 'P009', workCategory: '実装' }])
    })

    it('前後の空白を除いてから同名かを判定する', () => {
      const sessions = [
        startedOn('2026-06-01', { id: 'a', name: '資料作成 ' }),
        startedOn('2026-06-02', { id: 'b', name: ' 資料作成' }),
      ]

      const { names } = buildSuggestions(sessions)

      expect(names.map(n => n.name)).toEqual(['資料作成'])
    })

    it('名前が空白のみのセッションは含めない', () => {
      const sessions = [startedOn('2026-06-01', { name: '  ' })]

      const { names } = buildSuggestions(sessions)

      expect(names).toEqual([])
    })

    it('区間が無いセッション（手動追加）は date で新しさを比較する', () => {
      const sessions = [
        makeSession({ id: 'a', name: '手動タスク', date: '2026-06-09', times: [] }),
        startedOn('2026-06-01', { id: 'b', name: '通常タスク' }),
      ]

      const { names } = buildSuggestions(sessions)

      expect(names[0].name).toBe('手動タスク')
    })

    it('区間が複数あれば最後の区間の開始時刻で新しさを比較する', () => {
      const sessions = [
        makeSession({
          id: 'a',
          name: '後で再開した作業',
          date: '2026-06-01',
          times: [
            interval('2026-06-01T09:00:00', '2026-06-01T09:30:00'),
            interval('2026-06-01T17:00:00', '2026-06-01T17:30:00'),
          ],
        }),
        makeSession({ id: 'b', name: '昼の作業', date: '2026-06-01', times: [interval('2026-06-01T12:00:00', '2026-06-01T13:00:00')] }),
      ]

      const { names } = buildSuggestions(sessions)

      expect(names[0].name).toBe('後で再開した作業')
    })
  })

  describe('PJコードの候補', () => {
    it('空値を除外し、重複なく新しい順に並ぶ', () => {
      const sessions = [
        startedOn('2026-06-01', { id: 'a', name: 'A', projectCode: 'P001' }),
        startedOn('2026-06-03', { id: 'b', name: 'B', projectCode: '' }),
        startedOn('2026-06-05', { id: 'c', name: 'C', projectCode: 'P002' }),
        startedOn('2026-06-06', { id: 'd', name: 'D', projectCode: 'P001' }),
      ]

      const { projectCodes } = buildSuggestions(sessions)

      expect(projectCodes).toEqual(['P001', 'P002'])
    })
  })

  describe('作業区分の候補', () => {
    it('空値を除外し、重複なく新しい順に並ぶ', () => {
      const sessions = [
        startedOn('2026-06-01', { id: 'a', name: 'A', workCategory: '設計' }),
        startedOn('2026-06-03', { id: 'b', name: 'B', workCategory: '' }),
        startedOn('2026-06-05', { id: 'c', name: 'C', workCategory: '会議' }),
        startedOn('2026-06-06', { id: 'd', name: 'D', workCategory: '会議' }),
      ]

      const { workCategories } = buildSuggestions(sessions)

      expect(workCategories).toEqual(['会議', '設計'])
    })
  })

  it('セッションが無ければすべて空', () => {
    const suggestions = buildSuggestions([])

    expect(suggestions).toEqual({ names: [], projectCodes: [], workCategories: [] })
  })

  it('渡した配列の順序を変えない', () => {
    const sessions = [
      startedOn('2026-06-01', { id: 'a' }),
      startedOn('2026-06-05', { id: 'b' }),
    ]

    buildSuggestions(sessions)

    expect(sessions.map(s => s.id)).toEqual(['a', 'b'])
  })
})

describe('previousYearMonth', () => {
  it.each([
    ['前月を返す', '2026-06', '2026-05'],
    ['年をまたぐ', '2026-01', '2025-12'],
    ['月を2桁で返す', '2026-11', '2026-10'],
  ])('%s（%s → %s）', (_label, yearMonth, expected) => {
    const result = previousYearMonth(yearMonth)

    expect(result).toBe(expected)
  })
})
