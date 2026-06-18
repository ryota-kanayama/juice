import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimer } from './useTimer'
import type { Session } from '../types/session'

const mockSaveSession = vi.fn().mockResolvedValue(undefined)
const mockUpdateSession = vi.fn().mockResolvedValue(undefined)
const mockGetElapsedSettings = vi.fn()
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
  getElapsedSettings: mockGetElapsedSettings,
})

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSaveSession.mockClear()
    mockUpdateSession.mockClear()
    mockGetElapsedSettings.mockReset().mockResolvedValue({ enabled: false, minutes: 30 })
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

  it('stop の保存が失敗したら計測を継続し、例外を伝播する（データロス防止）', async () => {
    mockSaveSession.mockRejectedValueOnce(new Error('disk full'))
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業') })
    act(() => { vi.advanceTimersByTime(60000) })
    await act(async () => {
      await expect(result.current.stop()).rejects.toThrow('disk full')
    })
    // 保存に失敗しても計測は止めない（ユーザーが再試行できる）
    expect(result.current.isRunning).toBe(true)
    // interval が張り直され、開始時刻も保持されているので計測が継続する
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.elapsedSeconds).toBe(62)
    // 再試行すると成功し、計測した区間が保存される
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session).not.toBeNull()
    expect(result.current.isRunning).toBe(false)
    expect(mockSaveSession).toHaveBeenCalledTimes(2)
  })

  it('30秒未満で止めると totalTime が 0 になる（四捨五入）', async () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業') })
    act(() => { vi.advanceTimersByTime(20000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session!.totalTime).toBe(0)
  })

  it('30秒以上で止めると totalTime が 1 に四捨五入される', async () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業') })
    act(() => { vi.advanceTimersByTime(40000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session!.totalTime).toBe(1)
  })

  it('extend モードでも 30秒未満なら totalTime は加算されない', async () => {
    const existingSession: Session = {
      id: 'ext-id', taskId: 'ext-id', name: '延長', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-02-27T08:00:00', endTime: '2026-02-27T09:00:00' }],
      date: '2026-02-27', color: '#FF9500', totalTime: 60,
    }
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.startMore(existingSession) })
    act(() => { vi.advanceTimersByTime(20000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session!.totalTime).toBe(60)
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

  describe('baseSeconds（延長時の累計引き継ぎ）', () => {
    const existing: Session = {
      id: 'id-1',
      taskId: 'task-1',
      name: '既存作業',
      projectCode: 'P001',
      workCategory: '設計',
      times: [{ startTime: '2026-06-11T09:00:00', endTime: '2026-06-11T09:25:00' }],
      date: '2026-06-11',
      color: 'strawberry',
      totalTime: 25,
    }

    it('初期状態は0', () => {
      const { result } = renderHook(() => useTimer())
      expect(result.current.baseSeconds).toBe(0)
    })

    it('startMoreで既存セッションのtotalTime×60になる', () => {
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(existing) })
      expect(result.current.baseSeconds).toBe(1500)
      // elapsedSeconds（アニメーション用）は0から
      expect(result.current.elapsedSeconds).toBe(0)
    })

    it('startでは0のまま', () => {
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.start('新規作業') })
      expect(result.current.baseSeconds).toBe(0)
    })

    it('startMore後にstopすると0に戻る', async () => {
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(existing) })
      act(() => { vi.advanceTimersByTime(60000) })
      await act(async () => { await result.current.stop() })
      expect(result.current.baseSeconds).toBe(0)
    })

    it('startMore後にcancelすると0に戻る', () => {
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(existing) })
      act(() => { result.current.cancel() })
      expect(result.current.baseSeconds).toBe(0)
    })
  })

  describe('fillSeconds（ジュース満杯秒数）', () => {
    const existing: Session = {
      id: 'id-1',
      taskId: 'task-1',
      name: '既存作業',
      projectCode: 'P001',
      workCategory: '設計',
      times: [{ startTime: '2026-06-11T09:00:00', endTime: '2026-06-11T09:25:00' }],
      date: '2026-06-11',
      color: 'strawberry',
      totalTime: 25,
    }

    it('初期値は1500（25分）', () => {
      const { result } = renderHook(() => useTimer())
      expect(result.current.fillSeconds).toBe(1500)
    })

    it('経過時間通知OFFでstartすると1500', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      expect(result.current.fillSeconds).toBe(1500)
    })

    it('経過時間通知ON（30分）でstartすると1800', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      expect(result.current.fillSeconds).toBe(1800)
    })

    it('経過時間通知ON（60分）でstartMoreすると3600', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 60 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.startMore(existing) })
      expect(result.current.fillSeconds).toBe(3600)
    })

    it('設定読み込みに失敗してもタイマーは開始され1500になる', async () => {
      mockGetElapsedSettings.mockRejectedValue(new Error('read error'))
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      expect(result.current.isRunning).toBe(true)
      expect(result.current.fillSeconds).toBe(1500)
    })

    it('通知ONで開始→OFFに変更→再startで1500に戻る', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      expect(result.current.fillSeconds).toBe(1800)
      act(() => { result.current.cancel() })
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })
      await act(async () => { result.current.start('テスト2') })
      expect(result.current.fillSeconds).toBe(1500)
    })
  })

  describe('pause / resume', () => {
    it('pause を呼ぶと isPaused が true になり elapsed が止まる', () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.start('test') })
      act(() => { vi.advanceTimersByTime(5000) })
      act(() => { result.current.pause() })
      expect(result.current.isPaused).toBe(true)
      const frozen = result.current.elapsedSeconds
      act(() => { vi.advanceTimersByTime(3000) })
      expect(result.current.elapsedSeconds).toBe(frozen)
      vi.useRealTimers()
    })

    it('resume を呼ぶと isPaused が false になり elapsed が再開する', () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.start('test') })
      act(() => { vi.advanceTimersByTime(5000) })
      act(() => { result.current.pause() })
      act(() => { vi.advanceTimersByTime(3000) })
      act(() => { result.current.resume() })
      expect(result.current.isPaused).toBe(false)
      const before = result.current.elapsedSeconds
      act(() => { vi.advanceTimersByTime(2000) })
      expect(result.current.elapsedSeconds).toBeGreaterThan(before)
      vi.useRealTimers()
    })

    it('pause 中に stop すると pausedSeconds ぶんの時間で保存される', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.start('test') })
      act(() => { vi.advanceTimersByTime(5000) })
      act(() => { result.current.pause() })
      act(() => { vi.advanceTimersByTime(60000) }) // 一時停止中に1分経過
      let session: Awaited<ReturnType<typeof result.current.stop>> = null
      await act(async () => { session = await result.current.stop() })
      // totalTime は pause 前の約5秒（0分切り捨て） → 実質0分だが例外は出ない
      expect(session).not.toBeNull()
      vi.useRealTimers()
    })
  })
})
