import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SettingsStore } from '../settingsStore'

const { notificationCtor, showMock, isSupportedMock } = vi.hoisted(() => ({
  notificationCtor: vi.fn(),
  showMock: vi.fn(),
  isSupportedMock: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  Notification: class {
    constructor(opts: { title: string; body: string }) {
      notificationCtor(opts)
    }
    on(): void {
      // no-op
    }
    show(): void {
      showMock()
    }
    static isSupported(): boolean {
      return isSupportedMock()
    }
  },
}))

vi.mock('../windows/popover', () => ({ showPopoverFromNotification: vi.fn() }))
vi.mock('./activity', () => ({ recordActivity: vi.fn() }))

import { onTimerStarted, onTimerStopped, onTimerAdjustStartTime, isTimerRunning } from './elapsed'

const MINUTE = 60 * 1000

function makeStore(enabled: boolean, minutes: number): SettingsStore {
  return { getElapsedSettings: vi.fn(async () => ({ enabled, minutes })) } as unknown as SettingsStore
}

describe('elapsed notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    isSupportedMock.mockReturnValue(true)
  })

  afterEach(() => {
    onTimerStopped()
    vi.useRealTimers()
  })

  it('開始から指定分で経過通知が出る', async () => {
    onTimerStarted(makeStore(true, 30))
    expect(isTimerRunning()).toBe(true)
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(1)
    expect(notificationCtor).toHaveBeenCalledWith({ title: 'Juice', body: '作業中 — 30分経過しました' })
  })

  it('次の境界でも継続通知される（60分）', async () => {
    onTimerStarted(makeStore(true, 30))
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(2)
    expect(notificationCtor).toHaveBeenLastCalledWith({ title: 'Juice', body: '作業中 — 60分経過しました' })
  })

  it('停止後は通知せず isTimerRunning が false になる', async () => {
    onTimerStarted(makeStore(true, 30))
    onTimerStopped()
    expect(isTimerRunning()).toBe(false)
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
  })

  it('設定 OFF のときは通知しない', async () => {
    onTimerStarted(makeStore(false, 30))
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
  })

  it('開始時刻を調整すると新しい起点から数え直す', async () => {
    const store = makeStore(true, 30)
    onTimerStarted(store)
    await vi.advanceTimersByTimeAsync(20 * MINUTE)
    onTimerAdjustStartTime(Date.now(), store)
    await vi.advanceTimersByTimeAsync(29 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(1)
  })

  it('Notification 非対応環境では通知しない', async () => {
    isSupportedMock.mockReturnValue(false)
    onTimerStarted(makeStore(true, 30))
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
  })
})
