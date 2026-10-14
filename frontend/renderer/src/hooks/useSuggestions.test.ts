import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Session } from '../types/session'
import { useSuggestions } from './useSuggestions'
import { makeSession } from '../test/factories'

const list = vi.hoisted(() => vi.fn())
vi.mock('../repositories/sessionRepository', () => ({
  sessionRepository: { list: (ym: string) => list(ym) },
}))

const TODAY = '2026-06-15'

async function renderSuggestions(todaySessions: Session[] = []) {
  const hook = renderHook(() => useSuggestions(todaySessions, TODAY))
  await act(async () => {})
  return hook.result
}

beforeEach(() => {
  list.mockReset().mockResolvedValue([])
})

describe('useSuggestions', () => {
  it('今月と先月のセッションを読む', async () => {
    await renderSuggestions()

    expect(list.mock.calls.map(c => c[0]).sort()).toEqual(['2026-05', '2026-06'])
  })

  it('今月と先月のセッションから候補を作る', async () => {
    list.mockImplementation(async (ym: string) => ym === '2026-06'
      ? [makeSession({ id: 'a', name: '今月の作業', date: '2026-06-01' })]
      : [makeSession({ id: 'b', name: '先月の作業', date: '2026-05-20' })])

    const result = await renderSuggestions()

    expect(result.current.names.map(n => n.name).sort()).toEqual(['今月の作業', '先月の作業'])
  })

  it('今日の分はファイルではなく、手元の最新（todaySessions）を使う', async () => {
    list.mockResolvedValue([makeSession({ id: 'a', projectCode: '旧コード', date: TODAY })])
    const todaySessions = [makeSession({ id: 'a', projectCode: '新コード', date: TODAY })]

    const result = await renderSuggestions(todaySessions)

    expect(result.current.projectCodes).toEqual(['新コード'])
  })

  it('読み込みに失敗しても、手元の今日の分から候補を作る', async () => {
    list.mockRejectedValue(new Error('ipc error'))
    const todaySessions = [makeSession({ name: '今日の作業', date: TODAY })]

    const result = await renderSuggestions(todaySessions)

    expect(result.current.names.map(n => n.name)).toEqual(['今日の作業'])
  })
})
