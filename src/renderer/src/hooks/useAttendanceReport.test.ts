// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAttendanceReport } from './useAttendanceReport'
import type { Session } from '../types/session'

const send = vi.fn()
vi.mock('../repositories/attendanceRepository', () => ({
  attendanceRepository: {
    send: (...args: unknown[]) => send(...args),
  },
}))

function makeSession(): Session {
  return {
    id: '1', taskId: '1', name: '作業', projectCode: 'P', workCategory: 'C',
    times: [{ startTime: '2026-06-12T10:00:00', endTime: '2026-06-12T11:00:00' }],
    date: '2026-06-12', color: '#FF9500', totalTime: 60,
  }
}

beforeEach(() => {
  send.mockReset()
})

describe('useAttendanceReport — 送信結果の分類', () => {
  it('成功時は success', async () => {
    send.mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const { result } = renderHook(() => useAttendanceReport([makeSession()]))
    await act(async () => { await result.current.send() })
    expect(result.current.sendResult).toBe('success')
  })

  it('未サインイン（status 0）は auth', async () => {
    send.mockResolvedValue({ ok: false, status: 0, body: 'Slack サインインが必要です（設定 > アカウント）' })
    const { result } = renderHook(() => useAttendanceReport([makeSession()]))
    await act(async () => { await result.current.send() })
    expect(result.current.sendResult).toBe('auth')
  })

  it('セッション切れ（status 401）は auth', async () => {
    send.mockResolvedValue({ ok: false, status: 401, body: '{"error":"unauthorized"}' })
    const { result } = renderHook(() => useAttendanceReport([makeSession()]))
    await act(async () => { await result.current.send() })
    expect(result.current.sendResult).toBe('auth')
  })

  it('勤怠 API の入力不備（status 400）は error', async () => {
    send.mockResolvedValue({ ok: false, status: 400, body: '{"error_message":"format"}' })
    const { result } = renderHook(() => useAttendanceReport([makeSession()]))
    await act(async () => { await result.current.send() })
    expect(result.current.sendResult).toBe('error')
  })

  it('上流エラー（status 502）は error', async () => {
    send.mockResolvedValue({ ok: false, status: 502, body: 'attendance api error' })
    const { result } = renderHook(() => useAttendanceReport([makeSession()]))
    await act(async () => { await result.current.send() })
    expect(result.current.sendResult).toBe('error')
  })

  it('例外時は error', async () => {
    send.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAttendanceReport([makeSession()]))
    await act(async () => { await result.current.send() })
    expect(result.current.sendResult).toBe('error')
  })

  it('送信結果は3秒後にクリアされる', async () => {
    vi.useFakeTimers()
    try {
      send.mockResolvedValue({ ok: false, status: 0, body: 'x' })
      const { result } = renderHook(() => useAttendanceReport([makeSession()]))
      await act(async () => { await result.current.send() })
      expect(result.current.sendResult).toBe('auth')
      act(() => { vi.advanceTimersByTime(3000) })
      expect(result.current.sendResult).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
