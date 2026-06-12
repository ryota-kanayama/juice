// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendSlackTeleworkStart, sendSlackTeleworkEnd, _resetForTest } from './slack'

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

function makeStores(token: string | null) {
  return {
    settingsStore: {
      getSlackSettings: vi.fn().mockResolvedValue({ projectCode: 'ES1', projectName: 'PJ' }),
    },
    authStore: { getToken: vi.fn().mockResolvedValue(token) },
  }
}

beforeEach(() => {
  vi.stubEnv('MAIN_VITE_PROXY_URL', 'https://proxy.test')
  httpPost.mockReset()
  showNotification.mockClear()
  _resetForTest()
})

describe('sendSlackTeleworkStart', () => {
  it('サインイン済みなら Lambda にアクション形式で POST する', async () => {
    httpPost.mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const { settingsStore, authStore } = makeStores('jwt.token.x')
    await sendSlackTeleworkStart(settingsStore as never, authStore as never)
    const [url, body, headers] = httpPost.mock.calls[0]
    expect(url).toBe('https://proxy.test/api/slack.post')
    expect(JSON.parse(body)).toEqual({
      kind: 'telework_start', projectCode: 'ES1', projectName: 'PJ',
    })
    expect(headers.Authorization).toBe('Bearer jwt.token.x')
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('未サインインなら POST せず通知を1回だけ出す', async () => {
    const { settingsStore, authStore } = makeStores(null)
    await sendSlackTeleworkStart(settingsStore as never, authStore as never)
    await sendSlackTeleworkStart(settingsStore as never, authStore as never)
    expect(httpPost).not.toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalledTimes(1)
  })

  it('401 応答ならサインイン促し通知を出して throw しない', async () => {
    httpPost.mockResolvedValue({ ok: false, status: 401, body: '{"error":"unauthorized"}' })
    const { settingsStore, authStore } = makeStores('expired.jwt.x')
    await sendSlackTeleworkStart(settingsStore as never, authStore as never)
    expect(showNotification).toHaveBeenCalledTimes(1)
  })

  it('401 以外の失敗は throw する（呼び出し側が catch してログする）', async () => {
    httpPost.mockResolvedValue({ ok: false, status: 502, body: 'slack api error' })
    const { settingsStore, authStore } = makeStores('jwt.token.x')
    await expect(
      sendSlackTeleworkStart(settingsStore as never, authStore as never)
    ).rejects.toThrow('Slack proxy error: 502')
  })
})

describe('sendSlackTeleworkEnd', () => {
  it('kind が telework_end になる', async () => {
    httpPost.mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const { settingsStore, authStore } = makeStores('jwt.token.x')
    await sendSlackTeleworkEnd(settingsStore as never, authStore as never)
    expect(JSON.parse(httpPost.mock.calls[0][1]).kind).toBe('telework_end')
  })
})
