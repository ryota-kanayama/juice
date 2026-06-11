// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { AuthStore } from './authStore'

// safeStorage を可逆なダミー実装でモック（prefix を付けるだけ）
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const text = b.toString()
      if (!text.startsWith('enc:')) throw new Error('復号失敗')
      return text.slice(4)
    },
  },
}))

function fakeJwt(claims: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.sig`
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600
const PAST = Math.floor(Date.now() / 1000) - 3600

describe('AuthStore', () => {
  let dir: string
  let store: AuthStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'juice-auth-'))
    store = new AuthStore(dir)
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('保存したトークンを取得できる', async () => {
    await store.saveToken('my.jwt.token')
    expect(await store.getToken()).toBe('my.jwt.token')
  })

  it('未保存なら getToken は null、getStatus は signedIn: false', async () => {
    expect(await store.getToken()).toBeNull()
    expect(await store.getStatus()).toEqual({ signedIn: false })
  })

  it('getStatus が JWT payload の name と exp を返す', async () => {
    await store.saveToken(fakeJwt({ name: '金山', exp: FUTURE }))
    const status = await store.getStatus()
    expect(status.signedIn).toBe(true)
    expect(status.name).toBe('金山')
    expect(status.expiresAt).toBe(new Date(FUTURE * 1000).toISOString())
  })

  it('期限切れトークンは signedIn: false', async () => {
    await store.saveToken(fakeJwt({ name: 'x', exp: PAST }))
    expect(await store.getStatus()).toEqual({ signedIn: false })
  })

  it('clearToken 後は signedIn: false', async () => {
    await store.saveToken(fakeJwt({ name: 'x', exp: FUTURE }))
    await store.clearToken()
    expect(await store.getToken()).toBeNull()
    expect(await store.getStatus()).toEqual({ signedIn: false })
  })

  it('壊れたファイルでも例外を投げず signedIn: false', async () => {
    const { writeFile } = await import('fs/promises')
    await writeFile(join(dir, 'auth.enc'), 'broken')
    expect(await store.getStatus()).toEqual({ signedIn: false })
  })
})
