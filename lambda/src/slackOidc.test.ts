// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildAuthorizeUrl, fetchSlackIdentity } from './slackOidc'

const OPTS = {
  clientId: 'CID',
  clientSecret: 'CSECRET',
  code: 'CODE123',
  redirectUri: 'https://example.lambda-url.test/auth/callback',
}

function mockFetchSequence(responses: object[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(r) })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('buildAuthorizeUrl', () => {
  it('Slack 認可 URL に必須パラメータが含まれる', () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: 'CID', redirectUri: 'https://x/auth/callback', state: 'abc' })
    )
    expect(url.origin + url.pathname).toBe('https://slack.com/openid/connect/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('CID')
    expect(url.searchParams.get('scope')).toBe('openid profile email users:read')
    expect(url.searchParams.get('redirect_uri')).toBe('https://x/auth/callback')
    expect(url.searchParams.get('state')).toBe('abc')
  })
})

describe('fetchSlackIdentity', () => {
  it('トークン交換 → userInfo で本人情報を返す', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, access_token: 'xoxp-test' },
      { ok: true, sub: 'U123', name: '金山', email: 'kanayama@jsl.co.jp', 'https://slack.com/team_id': 'T999' },
      { ok: true, user: { name: 'kanayama' } },
    ])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({
      sub: 'U123', name: '金山', teamId: 'T999', email: 'kanayama@jsl.co.jp', handle: 'kanayama',
    })
    // 1回目: トークン交換に code と client_secret が送られている
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://slack.com/api/openid.connect.token')
    expect(String(tokenInit.body)).toContain('code=CODE123')
    expect(String(tokenInit.body)).toContain('client_secret=CSECRET')
    // 2回目: userInfo に access_token が渡っている
    const [userUrl, userInit] = fetchMock.mock.calls[1]
    expect(userUrl).toBe('https://slack.com/api/openid.connect.userInfo')
    expect(userInit.headers.Authorization).toBe('Bearer xoxp-test')
    // 3回目: users.info に access_token と user=sub が渡っている
    const [usersUrl, usersInit] = fetchMock.mock.calls[2]
    expect(usersUrl).toBe('https://slack.com/api/users.info?user=U123')
    expect(usersInit.headers.Authorization).toBe('Bearer xoxp-test')
  })

  it('トークン交換失敗時は error を返す', async () => {
    mockFetchSequence([{ ok: false, error: 'invalid_code' }])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({ error: 'token: invalid_code' })
  })

  it('userInfo 失敗時は error を返す', async () => {
    mockFetchSequence([
      { ok: true, access_token: 'xoxp-test' },
      { ok: false, error: 'invalid_auth' },
    ])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({ error: 'userInfo: invalid_auth' })
  })

  it('name が無い場合は sub を name に使う', async () => {
    mockFetchSequence([
      { ok: true, access_token: 'xoxp-test' },
      { ok: true, sub: 'U123', 'https://slack.com/team_id': 'T999' },
      { ok: true, user: { name: 'handle1' } },
    ])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({ sub: 'U123', name: 'U123', teamId: 'T999', email: undefined, handle: 'handle1' })
  })

  it('email が無くても成功する（email は undefined）', async () => {
    mockFetchSequence([
      { ok: true, access_token: 'xoxp-test' },
      { ok: true, sub: 'U123', name: 'x', 'https://slack.com/team_id': 'T999' },
      { ok: true, user: { name: 'handle1' } },
    ])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({ sub: 'U123', name: 'x', teamId: 'T999', email: undefined, handle: 'handle1' })
  })

  it('users.info が失敗しても handle 無しで identity を返す', async () => {
    mockFetchSequence([
      { ok: true, access_token: 'xoxp-test' },
      { ok: true, sub: 'U123', name: '金山', 'https://slack.com/team_id': 'T999' },
      { ok: false, error: 'missing_scope' },
    ])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({
      sub: 'U123', name: '金山', teamId: 'T999', email: undefined, handle: undefined,
    })
  })

  it('users.info のネットワークエラーでも handle 無しで identity を返す', async () => {
    const fn = vi.fn()
    fn.mockResolvedValueOnce({ json: () => Promise.resolve({ ok: true, access_token: 'xoxp-test' }) })
    fn.mockResolvedValueOnce({ json: () => Promise.resolve({ ok: true, sub: 'U123', name: '金山', 'https://slack.com/team_id': 'T999' }) })
    fn.mockRejectedValueOnce(new Error('ETIMEDOUT'))
    vi.stubGlobal('fetch', fn)
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({
      sub: 'U123', name: '金山', teamId: 'T999', email: undefined, handle: undefined,
    })
  })

  it('fetch が network error で reject しても throw せず error を返す', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))
    vi.stubGlobal('fetch', fn)
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({ error: 'network: getaddrinfo ENOTFOUND' })
  })
})
