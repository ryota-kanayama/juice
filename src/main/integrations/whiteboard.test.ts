// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendWhiteboardTeleworkStart, sendWhiteboardLeave } from './whiteboard'
import { _resetForTest } from '../auth/promptSignIn'

const showNotification = vi.fn()
vi.mock('electron', () => ({
  Notification: class {
    constructor(opts: unknown) { showNotification(opts) }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    show() {}
  },
}))

const httpPost = vi.fn()
vi.mock('../http', () => ({
  httpPost: (...args: unknown[]) => httpPost(...args),
}))

function makeStores(token: string | null, enabled = true) {
  return {
    settingsStore: {
      getWhiteboardSettings: vi.fn().mockResolvedValue({ enabled }),
    } as never,
    authStore: { getToken: vi.fn().mockResolvedValue(token) } as never,
  }
}

beforeEach(() => {
  vi.stubEnv('MAIN_VITE_PROXY_URL', 'https://proxy.test')
  httpPost.mockReset()
  showNotification.mockClear()
  _resetForTest()
})

describe('sendWhiteboardTeleworkStart', () => {
  it('サインイン済みなら /api/whiteboard.telework に POST する', async () => {
    httpPost.mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const { settingsStore, authStore } = makeStores('jwt.x.y')
    await sendWhiteboardTeleworkStart(settingsStore, authStore)
    const [url, , headers] = httpPost.mock.calls[0]
    expect(url).toBe('https://proxy.test/api/whiteboard.telework')
    expect(headers.Authorization).toBe('Bearer jwt.x.y')
  })

  it('連携が無効なら何もしない', async () => {
    const { settingsStore, authStore } = makeStores('jwt.x.y', false)
    await sendWhiteboardTeleworkStart(settingsStore, authStore)
    expect(httpPost).not.toHaveBeenCalled()
  })

  it('未サインインなら通知してスキップ', async () => {
    const { settingsStore, authStore } = makeStores(null)
    await sendWhiteboardTeleworkStart(settingsStore, authStore)
    expect(httpPost).not.toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledTimes(1)
  })

  it('401（reauth_required 含む）は通知してスキップ、throw しない', async () => {
    httpPost.mockResolvedValue({ ok: false, status: 401, body: '{"error":"reauth_required"}' })
    const { settingsStore, authStore } = makeStores('old.jwt.x')
    await sendWhiteboardTeleworkStart(settingsStore, authStore)
    expect(showNotification).toHaveBeenCalledTimes(1)
  })

  it('その他の失敗は throw する', async () => {
    httpPost.mockResolvedValue({ ok: false, status: 502, body: 'whiteboard api error' })
    const { settingsStore, authStore } = makeStores('jwt.x.y')
    await expect(sendWhiteboardTeleworkStart(settingsStore, authStore))
      .rejects.toThrow('Whiteboard proxy error: 502')
  })
})

describe('sendWhiteboardLeave', () => {
  it('/api/whiteboard.leave に POST する', async () => {
    httpPost.mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const { settingsStore, authStore } = makeStores('jwt.x.y')
    await sendWhiteboardLeave(settingsStore, authStore)
    expect(httpPost.mock.calls[0][0]).toBe('https://proxy.test/api/whiteboard.leave')
  })
})
