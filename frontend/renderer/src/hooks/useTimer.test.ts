import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimer } from './useTimer'
import { totalMinutesOf } from '../domain/session'
import type { Session } from '../types/session'

const mockSaveSession = vi.fn().mockResolvedValue(undefined)
const mockUpdateSession = vi.fn().mockResolvedValue(undefined)
const mockGetSessions = vi.fn().mockResolvedValue([])
const mockGetElapsedSettings = vi.fn()
let elapsedFiredCallback: (() => void) | null = null
const mockOnElapsedNotificationFired = vi.fn((cb: () => void) => {
  elapsedFiredCallback = cb
  return () => { elapsedFiredCallback = null }
})
vi.stubGlobal('bridge', {
  saveSession: mockSaveSession,
  updateSession: mockUpdateSession,
  getSessions: mockGetSessions,
  resizeWindow: vi.fn().mockResolvedValue(undefined),
  openUrl: vi.fn().mockResolvedValue(undefined),
  hideWindow: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  timerStarted: vi.fn().mockResolvedValue(undefined),
  timerStopped: vi.fn().mockResolvedValue(undefined),
  timerAdjustStartTime: vi.fn().mockResolvedValue(undefined),
  getElapsedSettings: mockGetElapsedSettings,
  onElapsedNotificationFired: mockOnElapsedNotificationFired,
})

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSaveSession.mockClear()
    mockUpdateSession.mockClear()
    mockGetSessions.mockReset().mockResolvedValue([])
    mockGetElapsedSettings.mockReset().mockResolvedValue({ enabled: false, minutes: 30 })
    mockOnElapsedNotificationFired.mockClear()
    elapsedFiredCallback = null
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

  it('extend の保存が失敗したら計測を継続し、例外を伝播する（データロス防止）', async () => {
    // 今回変わったのは extend 経路（updateSession、書き込みの前に await が増えた）。
    // new モードと同型の保証をここでも固定する。
    mockUpdateSession.mockRejectedValueOnce(new Error('disk full'))
    const existingSession: Session = {
      id: 'existing-id', taskId: 'existing-id', name: 'メール作業', projectCode: 'P001', workCategory: '開発',
      times: [{ startTime: '2026-02-27T08:00:00', endTime: '2026-02-27T09:00:00' }],
      date: '2026-02-27', color: '#FF9500', totalTime: 60,
    }
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.startMore(existingSession) })
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
    expect(mockUpdateSession).toHaveBeenCalledTimes(2)
  })

  it('stop を素早く2回呼んでも saveSession は1回だけ呼ばれる（二重記録防止・new モード）', async () => {
    // stop() はディスクを読んでから書くようになったため、素早く2回呼ぶと
    // 2回目の読み込みが1回目の書き込みの後を読み、同じ区間が二重に記録されうる
    // （new モードでは UUID の違うレコードが2件保存される）。再入ガードで防ぐ。
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業') })
    act(() => { vi.advanceTimersByTime(60000) })
    let s1: Session | null = null
    let s2: Session | null = null
    await act(async () => {
      const p1 = result.current.stop()
      const p2 = result.current.stop()
      ;[s1, s2] = await Promise.all([p1, p2])
    })
    expect(mockSaveSession).toHaveBeenCalledOnce()
    expect(s1).not.toBeNull()
    expect(s2).toBeNull()
    expect(result.current.isRunning).toBe(false)
  })

  it('extend で stop を素早く2回呼んでも updateSession は1回だけ呼ばれ、times は2つのまま（二重記録防止）', async () => {
    const existingSession: Session = {
      id: 'existing-id', taskId: 'existing-id', name: 'メール作業', projectCode: 'P001', workCategory: '開発',
      times: [{ startTime: '2026-02-27T08:00:00', endTime: '2026-02-27T09:00:00' }],
      date: '2026-02-27', color: '#FF9500', totalTime: 60,
    }
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.startMore(existingSession) })
    act(() => { vi.advanceTimersByTime(60000) })
    let s1: Session | null = null
    let s2: Session | null = null
    await act(async () => {
      const p1 = result.current.stop()
      const p2 = result.current.stop()
      ;[s1, s2] = await Promise.all([p1, p2])
    })
    expect(mockUpdateSession).toHaveBeenCalledOnce()
    expect(s1).not.toBeNull()
    expect(s1!.times).toHaveLength(2)
    expect(s2).toBeNull()
    expect(result.current.isRunning).toBe(false)
  })

  it('30秒未満で止めても totalTime は 1 になる（区間があれば下限1分）', async () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('テスト作業') })
    act(() => { vi.advanceTimersByTime(20000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    // 以前は Math.round(ms/60000) をそのまま使っていたので 0 だったが、
    // totalTime は times から導出する（totalMinutesOf）ように変更した。
    // totalMinutesOf は完了区間が1つでもあれば最低1分を返す規則で、
    // Rust の total_time_from_intervals とも hasReliableTimes の判定とも揃う。
    // 0 のままだと「合計 0 ≠ 区間合計 1」で時刻が信用できない扱いになり、
    // 週表示の時間軸グリッドから消えてしまう。
    expect(session!.totalTime).toBe(1)
    expect(session!.totalTime).toBe(totalMinutesOf(session!.times))
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

  it('extend で2区間になっても totalTime が区間の合計と一致する（丸め誤差を持ち込まない）', async () => {
    // 90秒の区間（= 1.5分）を2つ持つセッション。区間ごとに丸めて足すと 2+2=4 分になるが、
    // 正しくは ms を合計してから丸めて 180秒 = 3分。
    const existingSession: Session = {
      id: 'round-id', taskId: 'round-id', name: '丸め', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-02-27T08:00:00', endTime: '2026-02-27T08:01:30' }],
      date: '2026-02-27', color: '#FF9500', totalTime: 2,
    }
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.startMore(existingSession) })
    act(() => { vi.advanceTimersByTime(90000) })
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session!.times).toHaveLength(2)
    expect(session!.totalTime).toBe(3)
    expect(session!.totalTime).toBe(totalMinutesOf(session!.times))
  })

  it('手編集で合計を変えたセッションを extend すると加算方式が維持される', async () => {
    // 区間の合計（30分）と totalTime（45分）が食い違う = ユーザーが手で整えた記録。
    // 区間から算出し直すと手入力値が消えてしまうため、従来どおり加算する。
    const existingSession: Session = {
      id: 'manual-id', taskId: 'manual-id', name: '手編集', projectCode: '', workCategory: '',
      times: [{ startTime: '2026-02-27T08:00:00', endTime: '2026-02-27T08:30:00' }],
      date: '2026-02-27', color: '#FF9500', totalTime: 45,
    }
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.startMore(existingSession) })
    act(() => { vi.advanceTimersByTime(600000) }) // 10分
    let session: Session | null = null
    await act(async () => { session = await result.current.stop() })
    expect(session!.totalTime).toBe(55)
    // 区間から算出し直していないこと（40分にはならない）
    expect(session!.totalTime).not.toBe(totalMinutesOf(session!.times))
  })

  // 「もう一杯」から停止までの間に他のウィンドウ（カレンダー）で直された内容を、
  // 停止時の保存で消さないこと。土台はスナップショットではなくディスクの最新。
  describe('extend の停止はディスクの最新を土台にする', () => {
    const snapshot: Session = {
      id: 'ext-id', taskId: 'ext-id', name: 'スナップショットの名前',
      projectCode: 'OLD-PJ', workCategory: '旧区分',
      times: [{ startTime: '2026-08-10T09:00:00', endTime: '2026-08-10T09:30:00' }],
      date: '2026-08-10', color: '#FF9500', totalTime: 30,
    }

    it('ディスクで直された名前が保存される（スナップショットの名前で上書きしない）', async () => {
      mockGetSessions.mockResolvedValue([{ ...snapshot, name: 'カレンダーで直した名前' }])
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(snapshot) })
      act(() => { vi.advanceTimersByTime(600000) })
      let session: Session | null = null
      await act(async () => { session = await result.current.stop() })
      expect(session!.name).toBe('カレンダーで直した名前')
    })

    it('ディスクで直された times に今回の区間を足す', async () => {
      // カレンダーで開始時刻を 08:00 に直した（区間が30分から90分になった）
      mockGetSessions.mockResolvedValue([{
        ...snapshot,
        times: [{ startTime: '2026-08-10T08:00:00', endTime: '2026-08-10T09:30:00' }],
        totalTime: 90,
      }])
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(snapshot) })
      act(() => { vi.advanceTimersByTime(600000) }) // 10分
      let session: Session | null = null
      await act(async () => { session = await result.current.stop() })
      expect(session!.times).toHaveLength(2)
      expect(session!.times[0].startTime).toBe('2026-08-10T08:00:00')
      expect(session!.totalTime).toBe(100)
      expect(session!.totalTime).toBe(totalMinutesOf(session!.times))
    })

    it('読み込みが失敗したらスナップショットで保存する（計測ぶんを失わない）', async () => {
      mockGetSessions.mockRejectedValue(new Error('disk error'))
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(snapshot) })
      act(() => { vi.advanceTimersByTime(600000) })
      let session: Session | null = null
      await act(async () => { session = await result.current.stop() })
      expect(session!.name).toBe('スナップショットの名前')
      expect(session!.times).toHaveLength(2)
      expect(session!.totalTime).toBe(40)
    })

    it('ディスクから消えていたらスナップショットで保存する', async () => {
      mockGetSessions.mockResolvedValue([])
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(snapshot) })
      act(() => { vi.advanceTimersByTime(600000) })
      let session: Session | null = null
      await act(async () => { session = await result.current.stop() })
      expect(session!.name).toBe('スナップショットの名前')
      expect(session!.times).toHaveLength(2)
      // 戻り値だけでなく、実際に保存されたこと（times が2つの状態で）も確認する
      expect(mockUpdateSession).toHaveBeenCalledOnce()
      expect(mockUpdateSession.mock.calls[0][0].times).toHaveLength(2)
    })

    it('終了時刻は読み込みより前に確定する（読み込みにかかった時間が作業時間に混ざらない）', async () => {
      let resolveRead: (v: Session[]) => void = () => {}
      mockGetSessions.mockReturnValue(new Promise(r => { resolveRead = r }))
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(snapshot) })
      act(() => { vi.advanceTimersByTime(600000) }) // 10分計測
      let session: Session | null = null
      const stopping = act(async () => { session = await result.current.stop() })
      // 読み込みに5分かかった状況を作る
      await act(async () => { vi.advanceTimersByTime(300000) })
      await act(async () => { resolveRead([snapshot]) })
      await stopping
      // 追加される区間は10分ぶん。読み込みの5分は含まれない
      expect(session!.totalTime).toBe(40)
    })

    it('停止ダイアログの PJコード・作業区分はディスクの最新より優先される', async () => {
      mockGetSessions.mockResolvedValue([{
        ...snapshot, projectCode: 'DISK-PJ', workCategory: 'ディスク区分',
      }])
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(snapshot) })
      act(() => { vi.advanceTimersByTime(600000) })
      let session: Session | null = null
      await act(async () => {
        session = await result.current.stop({ projectCode: 'NEW-PJ', workCategory: '新区分' })
      })
      expect(session!.projectCode).toBe('NEW-PJ')
      expect(session!.workCategory).toBe('新区分')
    })

    it('ディスクの記録が手編集の合計を持つなら加算方式を維持する', async () => {
      // 区間の合計（30分）と totalTime（45分）が食い違う = 手で整えた記録
      mockGetSessions.mockResolvedValue([{ ...snapshot, totalTime: 45 }])
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(snapshot) })
      act(() => { vi.advanceTimersByTime(600000) }) // 10分
      let session: Session | null = null
      await act(async () => { session = await result.current.stop() })
      expect(session!.totalTime).toBe(55)
      expect(session!.totalTime).not.toBe(totalMinutesOf(session!.times))
    })
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

    it('初期値は1800（30分）', () => {
      const { result } = renderHook(() => useTimer())
      expect(result.current.fillSeconds).toBe(1800)
    })

    it('経過時間通知OFFでstartすると1800', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      expect(result.current.fillSeconds).toBe(1800)
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

    it('設定読み込みに失敗してもタイマーは開始され1800になる', async () => {
      mockGetElapsedSettings.mockRejectedValue(new Error('read error'))
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      expect(result.current.isRunning).toBe(true)
      expect(result.current.fillSeconds).toBe(1800)
    })

    it('通知ONで開始→OFFに変更→再startで1800に戻る', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 45 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      expect(result.current.fillSeconds).toBe(2700)
      act(() => { result.current.cancel() })
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })
      await act(async () => { result.current.start('テスト2') })
      expect(result.current.fillSeconds).toBe(1800)
    })
  })

  it('start に渡した workLocation=telework が stop で保存される', async () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('タスク', undefined, 'telework') })
    await act(async () => { await Promise.resolve() })
    act(() => { vi.advanceTimersByTime(60000) })
    let saved: Session | null = null
    await act(async () => { saved = await result.current.stop({ projectCode: 'ZZ', workCategory: '開発' }) })
    expect((saved as Session | null)?.workLocation).toBe('telework')
    expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({ workLocation: 'telework' }))
  })

  it('workLocation=office（既定）では workLocation を保存しない', async () => {
    const { result } = renderHook(() => useTimer())
    act(() => { result.current.start('タスク', undefined, 'office') })
    await act(async () => { await Promise.resolve() })
    act(() => { vi.advanceTimersByTime(60000) })
    let saved: Session | null = null
    await act(async () => { saved = await result.current.stop({ projectCode: 'ZZ', workCategory: '開発' }) })
    expect((saved as Session | null)?.workLocation).toBeUndefined()
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
      // 区間は pause 前の約5秒ぶんだけ（一時停止中の60秒は含まない）。
      // totalTime は区間から導出するので下限の1分になる
      expect(session).not.toBeNull()
      expect(session!.totalTime).toBe(1)
      vi.useRealTimers()
    })
  })

  describe('juiceSeconds（ジュース水位の周期リセット）', () => {
    it('start直後は0', () => {
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.start('テスト') })
      expect(result.current.juiceSeconds).toBe(0)
    })

    it('startMore直後も0', () => {
      const existing: Session = {
        id: 'id-1', taskId: 'task-1', name: '既存作業', projectCode: 'P001', workCategory: '設計',
        times: [{ startTime: '2026-06-11T09:00:00', endTime: '2026-06-11T09:25:00' }],
        date: '2026-06-11', color: 'strawberry', totalTime: 25,
      }
      const { result } = renderHook(() => useTimer())
      act(() => { result.current.startMore(existing) })
      expect(result.current.juiceSeconds).toBe(0)
    })

    it('経過時間通知OFF時、fillSeconds（1800秒）経過でローカルに0へリセットされる', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      act(() => { vi.advanceTimersByTime(1799 * 1000) })
      expect(result.current.juiceSeconds).toBe(1799)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(result.current.juiceSeconds).toBe(0)
      // 表示用の経過時間はリセットされない
      expect(result.current.elapsedSeconds).toBe(1800)
    })

    it('経過時間通知OFF時、2周期目（3600秒）でも再度ローカルに0へリセットされる', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      act(() => { vi.advanceTimersByTime(1800 * 1000) })
      expect(result.current.juiceSeconds).toBe(0)
      act(() => { vi.advanceTimersByTime(1799 * 1000) })
      expect(result.current.juiceSeconds).toBe(1799)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(result.current.juiceSeconds).toBe(0)
      expect(result.current.elapsedSeconds).toBe(3600)
    })

    it('経過時間通知ON時も、イベントを待たずローカル周期リセットが働く（フォールバック）', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      // onElapsedNotificationFired イベントは一度も発火させていない
      act(() => { vi.advanceTimersByTime(1800 * 1000) })
      expect(result.current.juiceSeconds).toBe(0)
      expect(result.current.elapsedSeconds).toBe(1800)
    })

    it('経過時間通知ON時、onElapsedNotificationFiredイベントでリセットされる', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      // fillSeconds（1800秒）未満まで進め、ローカル周期リセット（フォールバック）が
      // まだ発火していない状態でイベントによるリセットを検証する
      act(() => { vi.advanceTimersByTime(1799 * 1000) })
      expect(result.current.juiceSeconds).toBe(1799)
      act(() => { elapsedFiredCallback?.() })
      expect(result.current.juiceSeconds).toBe(0)
      // 表示用の経過時間はリセットされない
      expect(result.current.elapsedSeconds).toBe(1799)
    })

    it('経過時間通知ON時、2回目のonElapsedNotificationFiredイベントでも再度リセットされる', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      act(() => { vi.advanceTimersByTime(1800 * 1000) })
      act(() => { elapsedFiredCallback?.() })
      expect(result.current.juiceSeconds).toBe(0)
      act(() => { vi.advanceTimersByTime(1800 * 1000) })
      act(() => { elapsedFiredCallback?.() })
      expect(result.current.juiceSeconds).toBe(0)
      expect(result.current.elapsedSeconds).toBe(3600)
    })

    it('タイマー停止後にイベントが来てもリセット処理は走らない', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: true, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      await act(async () => { await result.current.stop() })
      expect(() => { act(() => { elapsedFiredCallback?.() }) }).not.toThrow()
      expect(result.current.juiceSeconds).toBe(0)
    })

    it('adjustStartTimeで開始時刻を修正すると、cycleAnchorSecondsがfillSecondsの倍数に再アンカーされる', async () => {
      mockGetElapsedSettings.mockResolvedValue({ enabled: false, minutes: 30 })
      const { result } = renderHook(() => useTimer())
      await act(async () => { result.current.start('テスト') })
      // 5000秒経過（1800/3600の2つの周期境界を通過し、cycleAnchorSecondsは3600まで進んでいる）
      act(() => { vi.advanceTimersByTime(5000 * 1000) })
      expect(result.current.juiceSeconds).toBe(1400) // 5000 - 3600
      // 開始時刻を「1000秒前」に修正（合計時間を大幅に短縮する操作に相当）
      act(() => {
        result.current.adjustStartTime(new Date(Date.now() - 1000 * 1000))
      })
      // 修正前の cycleAnchorSeconds(3600) をそのまま引きずると
      // juiceSeconds = max(0, 1000 - 3600) = 0 に落ち込み、次の周期境界(5400秒)まで
      // 空のまま固まってしまう。再アンカーにより 1000 - (1000 % 1800) = 0 が新しい基準になり、
      // juiceSeconds は "空のまま固まる" のではなく妥当な値（1000）になる。
      expect(result.current.elapsedSeconds).toBe(1000)
      expect(result.current.juiceSeconds).toBe(1000)
    })
  })
})
