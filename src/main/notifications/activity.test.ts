import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  recordActivity,
  getLastActivityTime,
  wasIdleNotificationSent,
  markIdleNotificationSent,
} from './activity'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('activity', () => {
  it('recordActivity が最終操作時刻を現在へ更新し、通知済みフラグを下げる', () => {
    markIdleNotificationSent()
    expect(wasIdleNotificationSent()).toBe(true)

    vi.setSystemTime(new Date('2026-06-28T10:00:00'))
    recordActivity()

    expect(getLastActivityTime().getTime()).toBe(new Date('2026-06-28T10:00:00').getTime())
    expect(wasIdleNotificationSent()).toBe(false)
  })

  it('markIdleNotificationSent で通知済みになる', () => {
    recordActivity()
    expect(wasIdleNotificationSent()).toBe(false)
    markIdleNotificationSent()
    expect(wasIdleNotificationSent()).toBe(true)
  })
})
