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
    on(): void {}
    show(): void {
      showMock()
    }
    static isSupported(): boolean {
      return isSupportedMock()
    }
  },
}))

vi.mock('../windows/popover', () => ({
  showPopoverFromNotification: vi.fn(),
}))

import { onTimerStarted, onTimerStopped, onTimerAdjustStartTime } from './pomodoro'

const MINUTE = 60 * 1000

/** enabled を後から切り替えられる SettingsStore モック */
function makeSettingsStore(initialEnabled: boolean): {
  store: SettingsStore
  setEnabled: (v: boolean) => void
} {
  let enabled = initialEnabled
  const store = {
    getPomodoroSettings: vi.fn(async () => ({ enabled })),
  } as unknown as SettingsStore
  return { store, setEnabled: (v) => { enabled = v } }
}

describe('pomodoro notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    isSupportedMock.mockReturnValue(true)
  })

  afterEach(() => {
    onTimerStopped() // モジュール内 state をリセット
    vi.useRealTimers()
  })

  it('開始から25分で休憩通知が出る', async () => {
    const { store } = makeSettingsStore(true)
    onTimerStarted(store)

    await vi.advanceTimersByTimeAsync(25 * MINUTE)

    expect(showMock).toHaveBeenCalledTimes(1)
    expect(notificationCtor).toHaveBeenCalledWith({
      title: 'Juice',
      body: '25分経ちました。5分休憩してください',
    })
  })

  it('30分で再開通知、55分で次の休憩通知が出る（サイクル継続）', async () => {
    const { store } = makeSettingsStore(true)
    onTimerStarted(store)

    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(2)
    expect(notificationCtor).toHaveBeenLastCalledWith({
      title: 'Juice',
      body: '休憩終了です。作業を再開しましょう',
    })

    await vi.advanceTimersByTimeAsync(25 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(3)
    expect(notificationCtor).toHaveBeenLastCalledWith({
      title: 'Juice',
      body: '25分経ちました。5分休憩してください',
    })
  })

  it('停止後は通知が出ない', async () => {
    const { store } = makeSettingsStore(true)
    onTimerStarted(store)
    onTimerStopped()

    await vi.advanceTimersByTimeAsync(60 * MINUTE)

    expect(showMock).not.toHaveBeenCalled()
  })

  it('設定OFFのときは通知せず、ONに戻すと次の境界から通知される', async () => {
    const { store, setEnabled } = makeSettingsStore(false)
    onTimerStarted(store)

    await vi.advanceTimersByTimeAsync(25 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()

    setEnabled(true)
    await vi.advanceTimersByTimeAsync(5 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(1)
    expect(notificationCtor).toHaveBeenLastCalledWith({
      title: 'Juice',
      body: '休憩終了です。作業を再開しましょう',
    })
  })

  it('開始時刻を調整すると新しい起点から25分で通知される', async () => {
    const { store } = makeSettingsStore(true)
    onTimerStarted(store)

    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    onTimerAdjustStartTime(Date.now(), store) // 起点を「今」に変更

    await vi.advanceTimersByTimeAsync(24 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(1)
  })

  it('Notification 非対応環境では通知しない', async () => {
    isSupportedMock.mockReturnValue(false)
    const { store } = makeSettingsStore(true)
    onTimerStarted(store)

    await vi.advanceTimersByTimeAsync(25 * MINUTE)

    expect(showMock).not.toHaveBeenCalled()
  })
})
