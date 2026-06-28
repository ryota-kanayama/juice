import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const httpPostMock = vi.fn()
vi.mock('../http', () => ({ httpPost: (...a: unknown[]) => httpPostMock(...a) }))
const broadcastAuthToAll = vi.fn()
vi.mock('../windows/authBroadcast', () => ({ broadcastAuthToAll: (...a: unknown[]) => broadcastAuthToAll(...a) }))
vi.mock('../logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { refreshSession, startSessionRefresh } from './refreshSession'
import type { AuthStore } from './authStore'

function makeAuthStore(token: string | null): AuthStore {
  return {
    getToken: vi.fn(async () => token),
    saveToken: vi.fn(async () => undefined),
    getStatus: vi.fn(async () => ({ signedIn: true })),
  } as unknown as AuthStore
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('refreshSession', () => {
  it('トークン有り＋200 で新トークンを保存し auth を配信する', async () => {
    httpPostMock.mockResolvedValue({ ok: true, status: 200, body: JSON.stringify({ token: 'NEW' }) })
    const store = makeAuthStore('OLD')
    await refreshSession(store)
    expect(httpPostMock).toHaveBeenCalled()
    expect(store.saveToken).toHaveBeenCalledWith('NEW')
    expect(broadcastAuthToAll).toHaveBeenCalled()
  })

  it('トークン無しなら何もしない', async () => {
    const store = makeAuthStore(null)
    await refreshSession(store)
    expect(httpPostMock).not.toHaveBeenCalled()
    expect(store.saveToken).not.toHaveBeenCalled()
  })

  it('非 ok では保存も配信もしない', async () => {
    httpPostMock.mockResolvedValue({ ok: false, status: 401, body: '' })
    const store = makeAuthStore('OLD')
    await refreshSession(store)
    expect(store.saveToken).not.toHaveBeenCalled()
    expect(broadcastAuthToAll).not.toHaveBeenCalled()
  })
})

describe('startSessionRefresh', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('起動時に1回、24時間後にもう1回更新する', async () => {
    httpPostMock.mockResolvedValue({ ok: true, status: 200, body: JSON.stringify({ token: 'NEW' }) })
    startSessionRefresh(makeAuthStore('OLD'))
    await vi.advanceTimersByTimeAsync(0)
    expect(httpPostMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(httpPostMock).toHaveBeenCalledTimes(2)
  })
})
