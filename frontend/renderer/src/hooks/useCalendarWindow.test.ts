import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor, type RenderHookResult } from '@testing-library/react'
import { useCalendarWindow, type CalendarWindowState } from './useCalendarWindow'
import type { Session } from '../types/session'
import { interval, makeSession } from '../test/factories'

const mockList = vi.fn()
const mockUpdate = vi.fn()
const mockHolidays = vi.fn()
let sessionsChangedCb: ((p: { yearMonth: string }) => void) | null = null

vi.mock('../repositories/sessionRepository', () => ({
  sessionRepository: {
    list: (ym: string) => mockList(ym),
    update: (s: Session) => mockUpdate(s),
    onChanged: (cb: (p: { yearMonth: string }) => void) => {
      sessionsChangedCb = cb
      return () => { sessionsChangedCb = null }
    },
  },
}))
vi.mock('../repositories/holidayRepository', () => ({
  holidayRepository: { getAll: () => mockHolidays() },
}))

const sessionOn = (date: string, overrides: Partial<Session> = {}): Session => makeSession({
  date,
  times: [interval(`${date}T10:00:00`, `${date}T11:00:00`)],
  totalTime: 60,
  ...overrides,
})

type Hook = RenderHookResult<CalendarWindowState, unknown>['result']

function renderCalendar(): Hook {
  return renderHook(() => useCalendarWindow()).result
}

/** 初回の読み込みが終わるまで待つ */
async function renderLoaded(): Promise<Hook> {
  const hook = renderCalendar()
  await waitFor(() => expect(mockList).toHaveBeenCalled())
  await act(async () => {})
  return hook
}

/** 2026-08-06 の週から4週進めて、8/30(日)〜9/5(土) の月またぎの週を表示する */
function goToMonthCrossingWeek(hook: Hook): void {
  for (let i = 0; i < 4; i++) act(() => { hook.current.goNext() })
}

beforeEach(() => {
  // Date だけ偽造する。setTimeout は残して waitFor のポーリングを動かす
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0)) // 2026-08-06（木）
  mockList.mockReset().mockResolvedValue([])
  mockUpdate.mockReset().mockResolvedValue(undefined)
  mockHolidays.mockReset().mockResolvedValue({})
})

describe('useCalendarWindow', () => {
  describe('初期状態', () => {
    it('週表示', () => {
      const hook = renderCalendar()

      expect(hook.current.view).toBe('week')
    })

    it('基準日・選択日はどちらも今日', () => {
      const hook = renderCalendar()

      expect([hook.current.anchorDate, hook.current.selectedDate]).toEqual(['2026-08-06', '2026-08-06'])
    })
  })

  describe('visibleDates', () => {
    it('週表示では基準日を含む日曜始まりの7日', () => {
      const hook = renderCalendar()

      expect(hook.current.visibleDates).toEqual([
        '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
        '2026-08-06', '2026-08-07', '2026-08-08',
      ])
    })

    it('月表示では基準日の月の1日〜末日', () => {
      const hook = renderCalendar()

      act(() => { hook.current.setView('month') })

      expect(hook.current.visibleDates).toEqual(
        Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`),
      )
    })

    it('月表示の2月は28日まで（平年）', () => {
      vi.setSystemTime(new Date(2026, 1, 10, 12, 0, 0))
      const hook = renderCalendar()

      act(() => { hook.current.setView('month') })

      expect(hook.current.visibleDates.at(-1)).toBe('2026-02-28')
    })
  })

  describe('前後の移動', () => {
    it('週表示の goNext は7日進む', () => {
      const hook = renderCalendar()

      act(() => { hook.current.goNext() })

      expect(hook.current.anchorDate).toBe('2026-08-13')
    })

    it('週表示の goPrev は7日戻る', () => {
      const hook = renderCalendar()

      act(() => { hook.current.goPrev() })

      expect(hook.current.anchorDate).toBe('2026-07-30')
    })

    it('月表示の goNext は翌月1日へ移る', () => {
      const hook = renderCalendar()
      act(() => { hook.current.setView('month') })

      act(() => { hook.current.goNext() })

      expect(hook.current.anchorDate).toBe('2026-09-01')
    })

    it('月表示の goPrev は前月1日へ移る', () => {
      const hook = renderCalendar()
      act(() => { hook.current.setView('month') })

      act(() => { hook.current.goPrev() })

      expect(hook.current.anchorDate).toBe('2026-07-01')
    })

    it('月送りは年をまたぐ', () => {
      vi.setSystemTime(new Date(2026, 11, 15, 12, 0, 0))
      const hook = renderCalendar()

      act(() => { hook.current.goNextMonth() })

      expect(hook.current.anchorDate).toBe('2027-01-01')
    })

    it('goNextMonth は週表示中でも翌月へ移る', () => {
      const hook = renderCalendar()

      act(() => { hook.current.goNextMonth() })

      expect(hook.current.anchorDate).toBe('2026-09-01')
    })

    it('goPrevMonth は週表示中でも前月へ移る', () => {
      const hook = renderCalendar()

      act(() => { hook.current.goPrevMonth() })

      expect(hook.current.anchorDate).toBe('2026-07-01')
    })

    it('goToday で基準日と選択日を今日に戻す', () => {
      const hook = renderCalendar()
      act(() => { hook.current.goNext() })
      act(() => { hook.current.selectDate('2026-08-14') })

      act(() => { hook.current.goToday() })

      expect([hook.current.anchorDate, hook.current.selectedDate]).toEqual(['2026-08-06', '2026-08-06'])
    })
  })

  describe('selectDate', () => {
    it('選択日を変える', () => {
      const hook = renderCalendar()

      act(() => { hook.current.selectDate('2026-08-04') })

      expect(hook.current.selectedDate).toBe('2026-08-04')
    })

    it('表示範囲は動かさない', () => {
      const hook = renderCalendar()

      act(() => { hook.current.selectDate('2026-09-20') })

      expect(hook.current.anchorDate).toBe('2026-08-06')
    })
  })

  describe('セッションの読み込み', () => {
    it('表示範囲のセッションを日付ごとにまとめる', async () => {
      mockList.mockResolvedValue([
        sessionOn('2026-08-06', { id: 'a' }),
        sessionOn('2026-08-04', { id: 'b' }),
        sessionOn('2026-08-06', { id: 'c' }),
      ])

      const hook = await renderLoaded()

      expect({
        '2026-08-04': hook.current.sessionsByDate['2026-08-04'].map(s => s.id),
        '2026-08-06': hook.current.sessionsByDate['2026-08-06'].map(s => s.id),
      }).toEqual({ '2026-08-04': ['b'], '2026-08-06': ['a', 'c'] })
    })

    it('月をまたぐ週では両方の月を読み込む', async () => {
      const hook = await renderLoaded()
      mockList.mockClear()

      goToMonthCrossingWeek(hook)

      await waitFor(() => expect(mockList.mock.calls.map(c => c[0]).sort()).toEqual(['2026-08', '2026-09']))
    })

    it('同じ月の中で週を移るだけなら読み直さない（読み込み済みの月を使う）', async () => {
      const hook = await renderLoaded()
      mockList.mockClear()

      act(() => { hook.current.goNext() })
      await act(async () => {})

      expect(mockList).not.toHaveBeenCalled()
    })

    it('読み込みに失敗しても例外を投げない（表示は空のまま）', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockList.mockRejectedValue(new Error('disk error'))

      const hook = await renderLoaded()

      expect(hook.current.sessionsByDate).toEqual({})
    })
  })

  describe('updateSession', () => {
    it('ディスクへ保存する', async () => {
      mockList.mockResolvedValue([sessionOn('2026-08-06')])
      const hook = await renderLoaded()
      const edited = { ...sessionOn('2026-08-06'), name: '編集後' }

      await act(async () => { await hook.current.updateSession(edited) })

      expect(mockUpdate).toHaveBeenCalledWith(edited)
    })

    it('表示中の同じ日のセッションを置き換える', async () => {
      mockList.mockResolvedValue([sessionOn('2026-08-06')])
      const hook = await renderLoaded()
      const edited = { ...sessionOn('2026-08-06'), name: '編集後' }

      await act(async () => { await hook.current.updateSession(edited) })

      expect(hook.current.sessionsByDate['2026-08-06']).toEqual([edited])
    })

    it('保存に失敗したら表示を変えない', async () => {
      mockList.mockResolvedValue([sessionOn('2026-08-06', { name: '元の名前' })])
      mockUpdate.mockRejectedValue(new Error('disk error'))
      const hook = await renderLoaded()

      await act(() => hook.current.updateSession({ ...sessionOn('2026-08-06'), name: '編集後' }).catch(() => {}))

      expect(hook.current.sessionsByDate['2026-08-06'][0].name).toBe('元の名前')
    })
  })

  describe('祝日', () => {
    it('取得して保持する', async () => {
      mockHolidays.mockResolvedValue({ '2026-08-11': '山の日' })

      const hook = renderCalendar()

      await waitFor(() => expect(hook.current.holidays).toEqual({ '2026-08-11': '山の日' }))
    })
  })

  describe('他のウィンドウでの変更通知', () => {
    it('表示中の年月の通知で読み直す', async () => {
      mockList.mockResolvedValue([sessionOn('2026-08-06', { name: '古い名前' })])
      const hook = await renderLoaded()
      mockList.mockResolvedValue([sessionOn('2026-08-06', { name: '新しい名前' })])

      await act(async () => { sessionsChangedCb!({ yearMonth: '2026-08' }) })

      await waitFor(() => expect(hook.current.sessionsByDate['2026-08-06'][0].name).toBe('新しい名前'))
    })

    it('表示していない年月の通知では読み直さない', async () => {
      await renderLoaded()
      mockList.mockClear()

      await act(async () => { sessionsChangedCb!({ yearMonth: '2020-01' }) })

      expect(mockList).not.toHaveBeenCalled()
    })

    it('読み直しの結果が届く前に表示範囲が変わったら、その結果を捨てる', async () => {
      const hook = await renderLoaded()
      goToMonthCrossingWeek(hook)
      await waitFor(() => expect(mockList).toHaveBeenCalledWith('2026-09'))
      // 通知起点の読み直し（08・09 の2回）を宙に浮かせる。その次の読み込みは新しい週のもの
      let resolveStale!: (v: Session[]) => void
      const stale = new Promise<Session[]>(resolve => { resolveStale = resolve })
      mockList
        .mockImplementationOnce(() => stale)
        .mockImplementationOnce(() => stale)
        .mockImplementationOnce(() => Promise.resolve([sessionOn('2026-09-06', { id: 'new' })]))
      await act(async () => { sessionsChangedCb!({ yearMonth: '2026-08' }) })
      act(() => { hook.current.goNext() }) // 9/6〜9/12（2026-09 だけ）へ
      await waitFor(() => expect(hook.current.sessionsByDate['2026-09-06']).toHaveLength(1))

      await act(async () => { resolveStale([sessionOn('2026-08-06', { id: 'stale' })]) })

      expect(hook.current.sessionsByDate['2026-08-06']).toBeUndefined()
    })

    it('アンマウントすると購読を解除する', async () => {
      const { unmount } = renderHook(() => useCalendarWindow())

      unmount()

      expect(sessionsChangedCb).toBeNull()
    })
  })
})
