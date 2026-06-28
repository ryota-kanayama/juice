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

vi.mock('../windows/popover', () => ({ showPopoverFromNotification: vi.fn() }))

const { lastActivityMock, isRunningMock } = vi.hoisted(() => ({
  lastActivityMock: vi.fn(),
  isRunningMock: vi.fn(() => false),
}))

let idleSent = false
vi.mock('./activity', () => ({
  getLastActivityTime: () => lastActivityMock(),
  wasIdleNotificationSent: () => idleSent,
  markIdleNotificationSent: () => {
    idleSent = true
  },
}))
vi.mock('./elapsed', () => ({ isTimerRunning: () => isRunningMock() }))

import { startIdleCheck } from './idle'

const MINUTE = 60 * 1000
const BASE = new Date('2026-06-28T10:00:00').getTime()

function makeStore(enabled: boolean, minutes: number): SettingsStore {
  return { getIdleSettings: vi.fn(async () => ({ enabled, minutes })) } as unknown as SettingsStore
}

describe('idle notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE)
    vi.clearAllMocks()
    isSupportedMock.mockReturnValue(true)
    isRunningMock.mockReturnValue(false)
    lastActivityMock.mockReturnValue(new Date(BASE))
    idleSent = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('アイドルが閾値を超えると一度だけ通知し、通知済みにする', async () => {
    await startIdleCheck(makeStore(true, 30))
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(showMock).toHaveBeenCalledTimes(1)
    expect(notificationCtor).toHaveBeenCalledWith({
      title: 'Juice',
      body: 'ジュースを飲みたくありませんか？',
    })
  })

  it('設定 OFF では interval を張らず通知しない', async () => {
    await startIdleCheck(makeStore(false, 30))
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
  })

  it('タイマー稼働中はアイドルでも通知しない', async () => {
    isRunningMock.mockReturnValue(true)
    await startIdleCheck(makeStore(true, 30))
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
  })

  it('閾値未満では通知しない', async () => {
    await startIdleCheck(makeStore(true, 30))
    await vi.advanceTimersByTimeAsync(20 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
  })

  it('Notification 非対応環境では通知しない', async () => {
    isSupportedMock.mockReturnValue(false)
    await startIdleCheck(makeStore(true, 30))
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(showMock).not.toHaveBeenCalled()
  })
})
