import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { Session } from '../types/session'
import { formatLocalDate } from '../../../shared/sessionUtils'
import { useSuggestions } from './useSuggestions'
import { sessionRepository } from '../repositories/sessionRepository'

vi.mock('../repositories/sessionRepository', () => ({
  sessionRepository: {
    list: vi.fn(),
  },
}))

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 'id-1',
    taskId: 'task-1',
    name: '作業',
    projectCode: '',
    workCategory: '',
    times: [],
    date: '2026-05-01',
    color: '#ff6b6b',
    totalTime: 30,
    ...overrides,
  }
}

describe('useSuggestions', () => {
  beforeEach(() => {
    vi.mocked(sessionRepository.list).mockReset()
  })

  it('今月と先月のセッションを読み込んで候補を返す', async () => {
    vi.mocked(sessionRepository.list).mockImplementation(async (yearMonth: string) => {
      const current = formatLocalDate(Date.now()).slice(0, 7)
      if (yearMonth === current) {
        return [makeSession({ id: 'a', name: '今月の作業', projectCode: 'P001' })]
      }
      return [makeSession({ id: 'b', name: '先月の作業', projectCode: 'P002' })]
    })

    const { result } = renderHook(() => useSuggestions([]))

    await waitFor(() => {
      expect(result.current.names.map(n => n.name)).toEqual(
        expect.arrayContaining(['今月の作業', '先月の作業'])
      )
    })
    expect(sessionRepository.list).toHaveBeenCalledTimes(2)
  })

  it('当日分はファイルではなく todaySessions（メモリ上の最新）を使う', async () => {
    const today = formatLocalDate(Date.now())
    // ファイル上の当日セッション（古い値）
    vi.mocked(sessionRepository.list).mockResolvedValue([
      makeSession({ id: 'a', name: '保存済みの作業', projectCode: '旧コード', date: today }),
    ])
    // メモリ上の当日セッション（新しい値）
    const todaySessions = [
      makeSession({ id: 'a', name: '保存済みの作業', projectCode: '新コード', date: today }),
    ]

    const { result } = renderHook(() => useSuggestions(todaySessions))

    await waitFor(() => {
      expect(result.current.projectCodes).toEqual(['新コード'])
    })
  })
})
