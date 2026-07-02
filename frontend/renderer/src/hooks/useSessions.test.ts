// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSessions } from './useSessions'
import type { Session } from '../types/session'

const TODAY = '2026-06-17'
const YEAR_MONTH = '2026-06'

const getSessions = vi.fn()
const updateSession = vi.fn().mockResolvedValue(undefined)
const deleteSession = vi.fn().mockResolvedValue(undefined)
const teleworkStart = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('bridge', {
  getSessions,
  updateSession,
  deleteSession,
  teleworkStart,
})

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    taskId: 's1',
    name: 'テスト作業',
    projectCode: '',
    workCategory: '',
    times: [],
    date: TODAY,
    color: '#ffffff',
    totalTime: 30,
    ...overrides,
  }
}

describe('useSessions', () => {
  beforeEach(() => {
    // Date.now() だけ偽造。setTimeout/setInterval は残して waitFor が動くようにする。
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 17, 12, 0, 0))
    getSessions.mockResolvedValue([])
    updateSession.mockClear()
    deleteSession.mockClear()
    teleworkStart.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('初期ロードで today のセッションだけを読み込む', async () => {
    const todaySession = makeSession({ id: 's1', date: TODAY })
    const otherSession = makeSession({ id: 's2', date: '2026-06-16' })
    getSessions.mockResolvedValue([todaySession, otherSession])

    const { result } = renderHook(() => useSessions())

    await waitFor(() => expect(result.current.todaySessions).toHaveLength(1))
    expect(result.current.todaySessions[0].id).toBe('s1')
    expect(result.current.today).toBe(TODAY)
    expect(getSessions).toHaveBeenCalledWith(YEAR_MONTH)
  })

  it('upsertToday は既存セッションを置き換える', async () => {
    const original = makeSession()
    getSessions.mockResolvedValue([original])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.todaySessions).toHaveLength(1))

    const updated = { ...original, name: '更新後' }
    act(() => { result.current.upsertToday(updated) })

    expect(result.current.todaySessions).toHaveLength(1)
    expect(result.current.todaySessions[0].name).toBe('更新後')
  })

  it('upsertToday は存在しない id なら末尾に追加する', async () => {
    getSessions.mockResolvedValue([makeSession()])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.todaySessions).toHaveLength(1))

    const newSession = makeSession({ id: 's-new', name: '新規' })
    act(() => { result.current.upsertToday(newSession) })

    expect(result.current.todaySessions).toHaveLength(2)
    expect(result.current.todaySessions[1].id).toBe('s-new')
  })

  it('applyStartMore は対象セッションに稼働中区間を追加する', async () => {
    const session = makeSession({ times: [] })
    getSessions.mockResolvedValue([session])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.todaySessions).toHaveLength(1))

    act(() => { result.current.applyStartMore(session) })

    expect(result.current.todaySessions[0].times).toHaveLength(1)
    expect(result.current.todaySessions[0].times[0].endTime).toBeNull()
  })

  it('update は稼働中区間がなければ updateSession を呼んで state を更新する', async () => {
    const session = makeSession({
      times: [{ startTime: '2026-06-17T09:00:00', endTime: '2026-06-17T09:30:00' }],
    })
    getSessions.mockResolvedValue([session])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.todaySessions).toHaveLength(1))

    const updated = { ...session, name: '更新後' }
    await act(async () => { await result.current.update(updated) })

    expect(updateSession).toHaveBeenCalledWith(updated)
    expect(result.current.todaySessions[0].name).toBe('更新後')
  })

  it('update は稼働中区間があれば updateSession を呼ばずに state だけ更新する', async () => {
    const session = makeSession({
      times: [{ startTime: '2026-06-17T09:00:00', endTime: null }],
    })
    getSessions.mockResolvedValue([session])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.todaySessions).toHaveLength(1))

    const updated = { ...session, name: '更新後' }
    await act(async () => { await result.current.update(updated) })

    expect(updateSession).not.toHaveBeenCalled()
    expect(result.current.todaySessions[0].name).toBe('更新後')
  })

  it('add は新規セッションを保存して todaySessions に追加する', async () => {
    getSessions.mockResolvedValue([])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.today).toBe(TODAY))

    await act(async () => {
      await result.current.add({
        name: '手動追加',
        projectCode: 'PROJ',
        workCategory: '開発',
        totalTime: '45',
      })
    })

    expect(updateSession).toHaveBeenCalledOnce()
    expect(result.current.todaySessions).toHaveLength(1)
    expect(result.current.todaySessions[0].name).toBe('手動追加')
    expect(result.current.todaySessions[0].totalTime).toBe(45)
  })

  it('add に workLocation=telework を渡すとセッションへ反映される', async () => {
    const { result } = renderHook(() => useSessions())
    await act(async () => {
      await result.current.add({ name: 'a', projectCode: 'ZZ', workCategory: '開発', totalTime: '30' }, 'telework')
    })
    expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({ workLocation: 'telework' }))
  })

  it('remove は deleteSession を呼んで todaySessions から除去する', async () => {
    const session = makeSession()
    getSessions.mockResolvedValue([session])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.todaySessions).toHaveLength(1))

    await act(async () => { await result.current.remove('s1') })

    expect(deleteSession).toHaveBeenCalledWith('s1', YEAR_MONTH)
    expect(result.current.todaySessions).toHaveLength(0)
  })

  it('startTelework は teleworkStart を呼ぶ', async () => {
    getSessions.mockResolvedValue([])

    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.today).toBe(TODAY))

    await act(async () => { await result.current.startTelework() })

    expect(teleworkStart).toHaveBeenCalledOnce()
  })
})
