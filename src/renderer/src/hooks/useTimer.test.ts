import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimer } from './useTimer'
import type { Session } from '../types/session'

const mockSaveSession = vi.fn().mockResolvedValue(undefined)
const mockUpdateSession = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('electronAPI', {
  saveSession: mockSaveSession,
  updateSession: mockUpdateSession,
  getSessions: vi.fn().mockResolvedValue([]),
  openCalendar: vi.fn().mockResolvedValue(undefined),
  resizeWindow: vi.fn().mockResolvedValue(undefined),
  openUrl: vi.fn().mockResolvedValue(undefined),
  hideWindow: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  timerStarted: vi.fn().mockResolvedValue(undefined),
  timerStopped: vi.fn().mockResolvedValue(undefined),
})

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSaveSession.mockClear()
    mockUpdateSession.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('初期状態は停止中', () => {
    const { result } = renderHook(() => useTimer())
    expect(result.current.isRunning).toBe(false)
    expect(result.current.elapsedSeconds).toBe(0)
  })

  it('startで計測開始し、elapsedSecondsが増加する', () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業') })
    expect(result.current.isRunning).toBe(true)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.elapsedSeconds).toBe(3)
  })

  it('stopで計測停止し、times[0]を持つSessionを返す', async () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業') })
    act(() => { vi.advanceTimersByTime(60000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(result.current.isRunning).toBe(false)
    expect(session).not.toBeNull()
    expect(session!.name).toBe('テスト作業')
    expect(session!.times).toHaveLength(1)
    expect(session!.times[0].endTime).not.toBeNull()
    expect(session!.taskId).toBeTruthy()
    expect(mockSaveSession).toHaveBeenCalledOnce()
    expect(mockUpdateSession).not.toHaveBeenCalled()
  })

  it('colorを指定して開始すると同じcolorがセッションに含まれる', async () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業', '#FF9500') })
    act(() => { vi.advanceTimersByTime(60000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session!.color).toBe('#FF9500')
  })

  it('startMoreで既存セッションを延長し、timesが追記される', async () => {
    const existingSession: Session = {
      id: 'existing-id',
      taskId: 'existing-id',
      name: 'メール作業',
      projectCode: 'P001',
      workCategory: '開発',
      times: [{ startTime: '2026-02-27T08:00:00', endTime: '2026-02-27T09:00:00' }],
      date: '2026-02-27',
      color: '#FF9500',
      totalTime: 60,
    }
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.startMore(existingSession) })
    expect(result.current.isRunning).toBe(true)
    act(() => { vi.advanceTimersByTime(60000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session).not.toBeNull()
    expect(session!.id).toBe('existing-id')
    expect(session!.times).toHaveLength(2)
    expect(session!.times[1].endTime).not.toBeNull()
    expect(mockUpdateSession).toHaveBeenCalledOnce()
    expect(mockSaveSession).not.toHaveBeenCalled()
  })

  it('startMoreでstop時にprojectCodeを上書きできる', async () => {
    const existingSession: Session = {
      id: 'id1', taskId: 'id1', name: 'テスト', projectCode: 'OLD', workCategory: '設計',
      times: [{ startTime: '2026-02-27T08:00:00', endTime: '2026-02-27T09:00:00' }],
      date: '2026-02-27', color: '#FF6B6B', totalTime: 60,
    }
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.startMore(existingSession) })
    act(() => { vi.advanceTimersByTime(60000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop({ projectCode: 'NEW', workCategory: '実装' }) })
    expect(session!.projectCode).toBe('NEW')
    expect(session!.workCategory).toBe('実装')
  })

  it('初期状態では activeSessionId が null', () => {
    const { result } = renderHook(() => useTimer())
    expect(result.current.activeSessionId).toBeNull()
  })

  it('startMore 後は activeSessionId がセッションの id になる', () => {
    const { result } = renderHook(() => useTimer())
    const session: Session = {
      id: 'existing-id',
      taskId: 'existing-id',
      name: 'テスト',
      projectCode: '',
      workCategory: '',
      times: [{ startTime: '2026-02-27T09:00:00', endTime: '2026-02-27T09:30:00' }],
      date: '2026-02-27',
      color: '#FF9500',
      totalTime: 30,
    }
    act(() => { result.current.startMore(session) })
    expect(result.current.activeSessionId).toBe('existing-id')
  })

  it('cancel 後は isRunning が false になり activeSessionId が null になる', () => {
    const { result } = renderHook(() => useTimer())
    const session: Session = {
      id: 'existing-id',
      taskId: 'existing-id',
      name: 'テスト',
      projectCode: '',
      workCategory: '',
      times: [{ startTime: '2026-02-27T09:00:00', endTime: '2026-02-27T09:30:00' }],
      date: '2026-02-27',
      color: '#FF9500',
      totalTime: 30,
    }
    act(() => { result.current.startMore(session) })
    expect(result.current.isRunning).toBe(true)
    act(() => { result.current.cancel() })
    expect(result.current.isRunning).toBe(false)
    expect(result.current.activeSessionId).toBeNull()
  })

  it('cancel は IPC を呼ばない', () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト') })
    act(() => { result.current.cancel() })
    expect(mockSaveSession).not.toHaveBeenCalled()
    expect(mockUpdateSession).not.toHaveBeenCalled()
  })
})
