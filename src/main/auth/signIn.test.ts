// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startSignIn, handleAuthCallback, _resetForTest } from './signIn'

const openExternal = vi.fn()
const showNotification = vi.fn()
const send = vi.fn()

vi.mock('electron', () => ({
  shell: { openExternal: (...args: unknown[]) => openExternal(...args) },
  Notification: class {
    constructor(opts: unknown) { showNotification(opts) }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    show() {}
  },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: (...args: unknown[]) => send(...args) } }],
  },
}))

vi.mock('../logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))

function makeAuthStore() {
  return {
    saveToken: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ signedIn: true, name: '金山' }),
  }
}

beforeEach(() => {
  vi.stubEnv('MAIN_VITE_PROXY_URL', 'https://proxy.test')
  openExternal.mockClear()
  showNotification.mockClear()
  send.mockClear()
  _resetForTest()
})

/** startSignIn が開いた URL から state を取り出す */
function startedState(): string {
  const url = new URL(openExternal.mock.calls[0][0])
  return url.searchParams.get('state')!
}

describe('startSignIn', () => {
  it('PROXY_URL/auth/start を state 付きで開く', () => {
    startSignIn()
    const url = new URL(openExternal.mock.calls[0][0])
    expect(url.origin).toBe('https://proxy.test')
    expect(url.pathname).toBe('/auth/start')
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('handleAuthCallback', () => {
  it('state が一致すればトークンを保存して auth-changed を配信する', async () => {
    startSignIn()
    const state = startedState()
    const store = makeAuthStore()
    const handled = await handleAuthCallback(
      `juice://auth?token=a.b.c&state=${state}`, store as never
    )
    expect(handled).toBe(true)
    expect(store.saveToken).toHaveBeenCalledWith('a.b.c')
    expect(send).toHaveBeenCalledWith('auth-changed', { signedIn: true, name: '金山' })
  })

  it('state 不一致なら保存しない', async () => {
    startSignIn()
    const store = makeAuthStore()
    const handled = await handleAuthCallback(
      'juice://auth?token=a.b.c&state=WRONG', store as never
    )
    expect(handled).toBe(false)
    expect(store.saveToken).not.toHaveBeenCalled()
    expect(showNotification).toHaveBeenCalled()
  })

  it('サインイン開始前のコールバックは無視する', async () => {
    const store = makeAuthStore()
    expect(await handleAuthCallback('juice://auth?token=a.b.c&state=x', store as never)).toBe(false)
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('state は一度使うと無効（リプレイ防止）', async () => {
    startSignIn()
    const state = startedState()
    const store = makeAuthStore()
    await handleAuthCallback(`juice://auth?token=a.b.c&state=${state}`, store as never)
    expect(
      await handleAuthCallback(`juice://auth?token=x.y.z&state=${state}`, store as never)
    ).toBe(false)
  })

  it('juice://auth 以外の URL は無視する', async () => {
    startSignIn()
    const store = makeAuthStore()
    expect(await handleAuthCallback('https://evil.test/auth', store as never)).toBe(false)
    expect(await handleAuthCallback('juice://other?token=a&state=b', store as never)).toBe(false)
    expect(showNotification).not.toHaveBeenCalled()
  })
})
