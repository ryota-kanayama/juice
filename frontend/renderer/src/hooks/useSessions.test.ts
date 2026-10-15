// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, type RenderHookResult } from '@testing-library/react'
import { useSessions, type SessionsState } from './useSessions'
import type { Session } from '../types/session'
import { interval, makeSession } from '../test/factories'

const TODAY = '2026-06-17'
const YEAR_MONTH = '2026-06'

const getSessions = vi.fn()
const updateSession = vi.fn()
const deleteSession = vi.fn()
const teleworkStart = vi.fn()
let sessionsChangedCb: ((p: { yearMonth: string }) => void) | null = null

vi.stubGlobal('bridge', {
  getSessions,
  updateSession,
  deleteSession,
  teleworkStart,
  onSessionsChanged: (cb: (p: { yearMonth: string }) => void) => {
    sessionsChangedCb = cb
    return () => { sessionsChangedCb = null }
  },
})

const todaySession = (overrides: Partial<Session> = {}): Session => makeSession({
  date: TODAY,
  times: [interval(`${TODAY}T09:00:00`, `${TODAY}T09:30:00`)],
  ...overrides,
})

type Hook = RenderHookResult<SessionsState, unknown>

/** 初回の読み込みが終わるまで待ってから返す */
async function renderLoaded(initial: Session[]): Promise<Hook> {
  getSessions.mockResolvedValue(initial)
  const hook = renderHook(() => useSessions())
  await waitFor(() => expect(getSessions).toHaveBeenCalled())
  await act(async () => {})
  return hook
}

async function notifyChanged(yearMonth: string): Promise<void> {
  await act(async () => { sessionsChangedCb!({ yearMonth }) })
}

beforeEach(() => {
  // Date だけ偽造する。setTimeout は残して waitFor が動くようにする
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 5, 17, 12, 0, 0))
  getSessions.mockReset().mockResolvedValue([])
  updateSession.mockReset().mockResolvedValue(undefined)
  deleteSession.mockReset().mockResolvedValue(undefined)
  teleworkStart.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useSessions', () => {
  describe('初回の読み込み', () => {
    it('今日を含む月を読み込む', async () => {
      await renderLoaded([])

      expect(getSessions).toHaveBeenCalledWith(YEAR_MONTH)
    })

    it('今日のセッションだけを持つ', async () => {
      const { result } = await renderLoaded([
        todaySession({ id: 's1' }),
        makeSession({ id: 's2', date: '2026-06-16' }),
      ])

      expect(result.current.todaySessions.map(s => s.id)).toEqual(['s1'])
    })

    it('today は今日の日付', async () => {
      const { result } = await renderLoaded([])

      expect(result.current.today).toBe(TODAY)
    })
  })

  describe('upsertToday', () => {
    it('同じ id のセッションを置き換える', async () => {
      const original = todaySession({ name: '更新前' })
      const { result } = await renderLoaded([original])

      act(() => { result.current.upsertToday({ ...original, name: '更新後' }) })

      expect(result.current.todaySessions).toEqual([{ ...original, name: '更新後' }])
    })

    it('無い id なら末尾に追加する', async () => {
      const { result } = await renderLoaded([todaySession({ id: 's1' })])

      act(() => { result.current.upsertToday(todaySession({ id: 's-new' })) })

      expect(result.current.todaySessions.map(s => s.id)).toEqual(['s1', 's-new'])
    })
  })

  describe('applyStartMore', () => {
    it('対象のセッションに稼働中の区間を足す', async () => {
      const session = todaySession({ times: [] })
      const { result } = await renderLoaded([session])

      act(() => { result.current.applyStartMore(session) })

      expect(result.current.todaySessions[0].times).toEqual([interval(`${TODAY}T12:00:00`, null)])
    })

    it('ほかのセッションには触れない', async () => {
      const target = todaySession({ id: 's1' })
      const other = todaySession({ id: 's2' })
      const { result } = await renderLoaded([target, other])

      act(() => { result.current.applyStartMore(target) })

      expect(result.current.todaySessions[1]).toEqual(other)
    })
  })

  describe('update', () => {
    it('稼働中の区間が無ければディスクへ保存する', async () => {
      const session = todaySession()
      const { result } = await renderLoaded([session])
      const updated = { ...session, name: '更新後' }

      await act(async () => { await result.current.update(updated) })

      expect(updateSession).toHaveBeenCalledWith(updated)
    })

    it('稼働中の区間があればディスクへ保存しない（停止時に保存される）', async () => {
      const running = todaySession({ times: [interval(`${TODAY}T09:00:00`, null)] })
      const { result } = await renderLoaded([running])

      await act(async () => { await result.current.update({ ...running, name: '更新後' }) })

      expect(updateSession).not.toHaveBeenCalled()
    })

    it.each([
      ['停止済み', [interval(`${TODAY}T09:00:00`, `${TODAY}T09:30:00`)]],
      ['稼働中', [interval(`${TODAY}T09:00:00`, null)]],
    ])('%s のセッションでも一覧には反映する', async (_label, times) => {
      const session = todaySession({ times })
      const { result } = await renderLoaded([session])

      await act(async () => { await result.current.update({ ...session, name: '更新後' }) })

      expect(result.current.todaySessions[0].name).toBe('更新後')
    })

    it('保存に失敗したら例外を呼び出し元へ伝える', async () => {
      const session = todaySession()
      updateSession.mockRejectedValue(new Error('disk full'))
      const { result } = await renderLoaded([session])

      const error = await act(() => result.current.update({ ...session, name: '更新後' }).catch((e: unknown) => e))

      expect(error).toEqual(new Error('disk full'))
    })

    it('保存に失敗したら一覧を変えない', async () => {
      const session = todaySession({ name: '更新前' })
      updateSession.mockRejectedValue(new Error('disk full'))
      const { result } = await renderLoaded([session])

      await act(() => result.current.update({ ...session, name: '更新後' }).catch(() => {}))

      expect(result.current.todaySessions[0].name).toBe('更新前')
    })
  })

  describe('add（手動追加）', () => {
    const params = {
      name: '手動追加',
      projectCode: 'PROJ',
      workCategory: '開発',
      times: [interval(`${TODAY}T09:00:00`, `${TODAY}T09:45:00`)],
    }

    it('区間から合計を算出したセッションを保存する', async () => {
      const { result } = await renderLoaded([])

      await act(async () => { await result.current.add(params) })

      expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({ ...params, totalTime: 45, date: TODAY }))
    })

    it('保存したセッションを一覧に追加する', async () => {
      const { result } = await renderLoaded([])

      await act(async () => { await result.current.add(params) })

      expect(result.current.todaySessions).toEqual([updateSession.mock.calls[0][0]])
    })

    it('workLocation=telework を渡すとセッションに付く', async () => {
      const { result } = await renderLoaded([])

      await act(async () => { await result.current.add(params, 'telework') })

      expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({ workLocation: 'telework' }))
    })

    it('保存に失敗したら一覧に追加しない', async () => {
      updateSession.mockRejectedValue(new Error('disk full'))
      const { result } = await renderLoaded([])

      await act(() => result.current.add(params).catch(() => {}))

      expect(result.current.todaySessions).toEqual([])
    })
  })

  describe('remove', () => {
    it('今日の月を指定してディスクから削除する', async () => {
      const { result } = await renderLoaded([todaySession({ id: 's1' })])

      await act(async () => { await result.current.remove('s1') })

      expect(deleteSession).toHaveBeenCalledWith('s1', YEAR_MONTH)
    })

    it('一覧から取り除く', async () => {
      const { result } = await renderLoaded([todaySession({ id: 's1' }), todaySession({ id: 's2' })])

      await act(async () => { await result.current.remove('s1') })

      expect(result.current.todaySessions.map(s => s.id)).toEqual(['s2'])
    })

    it('削除に失敗したら一覧から取り除かない', async () => {
      deleteSession.mockRejectedValue(new Error('disk error'))
      const { result } = await renderLoaded([todaySession({ id: 's1' })])

      await act(() => result.current.remove('s1').catch(() => {}))

      expect(result.current.todaySessions.map(s => s.id)).toEqual(['s1'])
    })
  })

  describe('startTelework', () => {
    it('テレワーク開始を通知する', async () => {
      const { result } = await renderLoaded([])

      await act(async () => { await result.current.startTelework() })

      expect(teleworkStart).toHaveBeenCalledOnce()
    })
  })

  describe('他のウィンドウでの変更通知', () => {
    it('当月の通知で読み直し、ディスクの内容を反映する', async () => {
      const { result } = await renderLoaded([todaySession({ id: 's1', name: '古い名前' })])
      getSessions.mockResolvedValue([todaySession({ id: 's1', name: '新しい名前' })])

      await notifyChanged(YEAR_MONTH)

      await waitFor(() => expect(result.current.todaySessions[0].name).toBe('新しい名前'))
    })

    it('別の年月の通知では読み直さない', async () => {
      await renderLoaded([todaySession()])
      getSessions.mockClear()

      await notifyChanged('2020-01')

      expect(getSessions).not.toHaveBeenCalled()
    })

    it('読み直しても、ディスクに無い稼働中の作業を残す', async () => {
      // 稼働中の作業は停止までディスクに書かれない
      const { result } = await renderLoaded([todaySession({ id: 's1' })])
      act(() => { result.current.upsertToday(todaySession({ id: 's2', times: [interval(`${TODAY}T13:00:00`, null)] })) })

      await notifyChanged(YEAR_MONTH)

      await waitFor(() => expect(result.current.todaySessions.map(s => s.id).sort()).toEqual(['s1', 's2']))
    })

    it('読み直しに失敗したら手元の内容を保つ', async () => {
      const { result } = await renderLoaded([todaySession({ id: 's1' })])
      getSessions.mockRejectedValue(new Error('disk error'))

      await notifyChanged(YEAR_MONTH)

      expect(result.current.todaySessions.map(s => s.id)).toEqual(['s1'])
    })

    it('読み直しの結果が届く前に日付が変わったら、その結果を捨てる', async () => {
      const NEXT_DAY = '2026-06-18'
      const { result } = await renderLoaded([todaySession({ id: 's1' })])
      let resolveStale!: (v: Session[]) => void
      getSessions.mockReturnValueOnce(new Promise<Session[]>(resolve => { resolveStale = resolve }))
      await notifyChanged(YEAR_MONTH)
      // 通知起点の読み直しが宙に浮いたまま日付が変わる
      getSessions.mockResolvedValue([makeSession({ id: 's2', date: NEXT_DAY })])
      act(() => {
        vi.setSystemTime(new Date(2026, 5, 18, 0, 0, 5))
        window.dispatchEvent(new Event('focus'))
      })
      await waitFor(() => expect(result.current.todaySessions.map(s => s.id)).toEqual(['s2']))

      await act(async () => { resolveStale([todaySession({ id: 'stale' })]) })

      expect(result.current.todaySessions.map(s => s.id)).toEqual(['s2'])
    })

    it('アンマウントすると購読を解除する', async () => {
      const { unmount } = await renderLoaded([])

      unmount()

      expect(sessionsChangedCb).toBeNull()
    })
  })

  describe('日付が変わったとき', () => {
    it('新しい日のセッションを読み込む', async () => {
      const { result } = await renderLoaded([todaySession({ id: 's1' })])
      getSessions.mockResolvedValue([makeSession({ id: 's2', date: '2026-06-18' })])

      act(() => {
        vi.setSystemTime(new Date(2026, 5, 18, 0, 0, 5))
        window.dispatchEvent(new Event('focus'))
      })

      await waitFor(() => expect(result.current.todaySessions.map(s => s.id)).toEqual(['s2']))
    })

    it('月が変わったら新しい月を読みにいく', async () => {
      vi.setSystemTime(new Date(2026, 5, 30, 23, 59, 0))
      await renderLoaded([])

      act(() => {
        vi.setSystemTime(new Date(2026, 6, 1, 0, 0, 5))
        window.dispatchEvent(new Event('focus'))
      })

      await waitFor(() => expect(getSessions).toHaveBeenLastCalledWith('2026-07'))
    })
  })
})
