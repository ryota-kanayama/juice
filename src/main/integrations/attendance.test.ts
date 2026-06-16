// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendAttendance } from './attendance'

const httpPost = vi.fn()
vi.mock('../http', () => ({
  httpPost: (...args: unknown[]) => httpPost(...args),
}))

const sendWhiteboardLeave = vi.fn().mockResolvedValue(undefined)
vi.mock('./whiteboard', () => ({
  sendWhiteboardLeave: (...args: unknown[]) => sendWhiteboardLeave(...args),
}))

vi.mock('../logger', () => ({ logger: { error: vi.fn() } }))

function makeStores(token: string | null) {
  return {
    settingsStore: {} as never,
    authStore: { getToken: vi.fn().mockResolvedValue(token) } as never,
  }
}

beforeEach(() => {
  vi.stubEnv('MAIN_VITE_PROXY_URL', 'https://proxy.test')
  httpPost.mockReset()
  sendWhiteboardLeave.mockClear()
})

describe('sendAttendance', () => {
  it('サインイン済みなら Lambda に text を POST し結果を透過する', async () => {
    httpPost.mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const { settingsStore, authStore } = makeStores('jwt.x.y')
    const result = await sendAttendance(settingsStore, authStore, '勤怠\n8:30 17:30 60')
    expect(result).toEqual({ ok: true, status: 200, body: '{}' })
    const [url, body, headers] = httpPost.mock.calls[0]
    expect(url).toBe('https://proxy.test/api/attendance.send')
    expect(JSON.parse(body)).toEqual({ text: '勤怠\n8:30 17:30 60' })
    expect(headers.Authorization).toBe('Bearer jwt.x.y')
  })

  it('成功時はホワイトボード退勤を発火する', async () => {
    httpPost.mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const { settingsStore, authStore } = makeStores('jwt.x.y')
    await sendAttendance(settingsStore, authStore, 'text')
    expect(sendWhiteboardLeave).toHaveBeenCalledWith(settingsStore, authStore)
  })

  it('失敗時は後続連携を発火しない', async () => {
    httpPost.mockResolvedValue({ ok: false, status: 400, body: '{"error_message":"x"}' })
    const { settingsStore, authStore } = makeStores('jwt.x.y')
    const result = await sendAttendance(settingsStore, authStore, 'text')
    expect(result.ok).toBe(false)
    expect(sendWhiteboardLeave).not.toHaveBeenCalled()
  })

  it('未サインインなら POST せず結果メッセージを返す', async () => {
    const { settingsStore, authStore } = makeStores(null)
    const result = await sendAttendance(settingsStore, authStore, 'text')
    expect(result.ok).toBe(false)
    expect(result.body).toContain('サインイン')
    expect(httpPost).not.toHaveBeenCalled()
  })
})
