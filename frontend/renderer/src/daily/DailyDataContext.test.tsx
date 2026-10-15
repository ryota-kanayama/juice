// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DailyDataProvider, useDailyData } from './DailyDataContext'
import type { DailyMonth } from '../../../shared/types'

let dailyChangedCb: ((p: { yearMonth: string }) => void) | null = null
const repo = vi.hoisted(() => ({ getMonth: vi.fn(), setDay: vi.fn() }))

vi.mock('../repositories/dailyRepository', () => ({
  dailyRepository: {
    getMonth: (ym: string) => repo.getMonth(ym),
    setDay: (date: string, patch: unknown) => repo.setDay(date, patch),
    onChanged: (cb: (p: { yearMonth: string }) => void) => {
      dailyChangedCb = cb
      return () => { dailyChangedCb = null }
    },
  },
}))

const wrapper = ({ children }: { children: ReactNode }) => <DailyDataProvider>{children}</DailyDataProvider>

const month = (days: DailyMonth['days']): DailyMonth => ({ version: 1, days })

/** 月を読み込み済みにして返す */
async function renderLoaded(days: DailyMonth['days'] = {}) {
  repo.getMonth.mockResolvedValue(month(days))
  const { result, unmount } = renderHook(() => useDailyData(), { wrapper })
  await act(async () => { result.current.ensureMonth('2026-08') })
  return { result, unmount }
}

beforeEach(() => {
  repo.getMonth.mockReset()
  repo.setDay.mockReset().mockResolvedValue(undefined)
  dailyChangedCb = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DailyDataProvider', () => {
  describe('ensureMonth / getDay', () => {
    it('読み込んだ月の記録を getDay で返す', async () => {
      const { result } = await renderLoaded({ '2026-08-09': { workStart: '09:00' } })

      expect(result.current.getDay('2026-08-09')).toEqual({ workStart: '09:00' })
    })

    it('記録の無い日は null', async () => {
      const { result } = await renderLoaded({})

      expect(result.current.getDay('2026-08-10')).toBeNull()
    })

    it('同じ月は二度読まない', async () => {
      const { result } = await renderLoaded({})

      await act(async () => { result.current.ensureMonth('2026-08') })

      expect(repo.getMonth).toHaveBeenCalledOnce()
    })

    it('読み込みに失敗したら、次の ensureMonth で読み直す', async () => {
      repo.getMonth.mockRejectedValueOnce(new Error('disk error'))
      const { result } = renderHook(() => useDailyData(), { wrapper })
      await act(async () => { result.current.ensureMonth('2026-08') })
      repo.getMonth.mockResolvedValue(month({ '2026-08-09': { workStart: '09:00' } }))

      await act(async () => { result.current.ensureMonth('2026-08') })

      expect(result.current.getDay('2026-08-09')).toEqual({ workStart: '09:00' })
    })

    it('初回の読み込みより先に手元で更新した値は、古いディスクの値で潰さない', async () => {
      let resolveMonth: (v: DailyMonth) => void = () => {}
      repo.getMonth.mockReturnValue(new Promise(r => { resolveMonth = r }))
      const { result } = renderHook(() => useDailyData(), { wrapper })
      act(() => { result.current.ensureMonth('2026-08') })
      await act(async () => { await result.current.setDay('2026-08-09', { workStart: '09:00' }) })

      await act(async () => { resolveMonth(month({ '2026-08-09': { workStart: '古い値' } })) })

      expect(result.current.getDay('2026-08-09')?.workStart).toBe('09:00')
    })
  })

  describe('setDay', () => {
    it('保存を待たずに、既存の記録へ差分を重ねて反映する', async () => {
      const { result } = await renderLoaded({ '2026-08-09': { workStart: '09:00' } })
      repo.setDay.mockReturnValue(new Promise(() => {}))

      act(() => { void result.current.setDay('2026-08-09', { workEnd: '18:00' }) })

      expect(result.current.getDay('2026-08-09')).toEqual({ workStart: '09:00', workEnd: '18:00' })
    })

    it('差分だけを保存する', async () => {
      const { result } = await renderLoaded({ '2026-08-09': { workStart: '09:00' } })

      await act(async () => { await result.current.setDay('2026-08-09', { workEnd: '18:00' }) })

      expect(repo.setDay).toHaveBeenCalledWith('2026-08-09', { workEnd: '18:00' })
    })

    it('保存に失敗したら例外を呼び出し元へ伝える', async () => {
      repo.setDay.mockRejectedValue(new Error('disk full'))
      const { result } = await renderLoaded({})

      const error = await act(() => result.current.setDay('2026-08-09', { workEnd: '18:00' }).catch((e: unknown) => e))

      expect(error).toEqual(new Error('disk full'))
    })
  })

  describe('他のウィンドウでの変更通知', () => {
    it('読み込み済みの月なら読み直し、ディスクの値を優先する', async () => {
      const { result } = await renderLoaded({ '2026-08-09': { workStart: '09:00' } })
      repo.getMonth.mockResolvedValue(month({ '2026-08-09': { workStart: '10:30' } }))

      await act(async () => { dailyChangedCb!({ yearMonth: '2026-08' }) })

      expect(result.current.getDay('2026-08-09')?.workStart).toBe('10:30')
    })

    it('読み込んでいない月の通知では読み直さない', async () => {
      await renderLoaded({})

      await act(async () => { dailyChangedCb!({ yearMonth: '2020-01' }) })

      expect(repo.getMonth).toHaveBeenCalledOnce()
    })

    it('読み直しに失敗しても手元の内容を保つ', async () => {
      const { result } = await renderLoaded({ '2026-08-09': { workStart: '09:00' } })
      repo.getMonth.mockRejectedValue(new Error('disk error'))

      await act(async () => { dailyChangedCb!({ yearMonth: '2026-08' }) })

      expect(result.current.getDay('2026-08-09')?.workStart).toBe('09:00')
    })

    it('読み直した後も、その月は読み込み済みのまま（ensureMonth で再読み込みしない）', async () => {
      const { result } = await renderLoaded({})
      await act(async () => { dailyChangedCb!({ yearMonth: '2026-08' }) })

      await act(async () => { result.current.ensureMonth('2026-08') })

      expect(repo.getMonth).toHaveBeenCalledTimes(2)
    })

    it('アンマウントすると購読を解除する', async () => {
      const { unmount } = await renderLoaded({})

      unmount()

      expect(dailyChangedCb).toBeNull()
    })
  })

  it('Provider の外で useDailyData を使うとエラーにする', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const render = () => renderHook(() => useDailyData())

    expect(render).toThrow('DailyDataProvider')
  })
})
