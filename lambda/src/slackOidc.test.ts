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
  it('標準 OAuth の認可 URL に user_scope を含める', () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: 'CID', redirectUri: 'https://x/auth/callback', state: 'abc' })
    )
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize')
    expect(url.searchParams.get('client_id')).toBe('CID')
    expect(url.searchParams.get('user_scope')).toBe('users:read,users:read.email')
    expect(url.searchParams.get('redirect_uri')).toBe('https://x/auth/callback')
    expect(url.searchParams.get('state')).toBe('abc')
  })
})

describe('fetchSlackIdentity', () => {
  it('oauth.v2.access → users.info で本人情報を返す', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, authed_user: { id: 'U123', access_token: 'xoxp-test' }, team: { id: 'T999' } },
      { ok: true, user: { name: 'kanayama', real_name: '金山 良太', profile: { email: 'kanayama@jsl.co.jp' } } },
    ])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toEqual({
      sub: 'U123', name: '金山 良太', teamId: 'T999', email: 'kanayama@jsl.co.jp', handle: 'kanayama',
    })
    // 1回目: oauth.v2.access に code と client_secret が送られている
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://slack.com/api/oauth.v2.access')
    expect(String(tokenInit.body)).toContain('code=CODE123')
    expect(String(tokenInit.body)).toContain('client_secret=CSECRET')
    // 2回目: users.info に access_token と user=sub が渡っている
    const [usersUrl, usersInit] = fetchMock.mock.calls[1]
    expect(usersUrl).toBe('https://slack.com/api/users.info?user=U123')
    expect(usersInit.headers.Authorization).toBe('Bearer xoxp-test')
  })

  it('real_name が無ければ name、それも無ければ sub を name に使う', async () => {
    mockFetchSequence([
      { ok: true, authed_user: { id: 'U123', access_token: 'xoxp-test' }, team: { id: 'T999' } },
      { ok: true, user: { name: 'kanayama', profile: {} } },
    ])
    expect(await fetchSlackIdentity(OPTS)).toEqual({
      sub: 'U123', name: 'kanayama', teamId: 'T999', email: undefined, handle: 'kanayama',
    })
  })

  it('profile の image_192 をアバターURL(picture)として返す', async () => {
    mockFetchSequence([
      { ok: true, authed_user: { id: 'U123', access_token: 'xoxp-test' }, team: { id: 'T999' } },
      {
        ok: true,
        user: {
          name: 'kanayama',
          real_name: '金山 良太',
          profile: { email: 'kanayama@jsl.co.jp', image_192: 'https://slack.test/avatar_192.png' },
        },
      },
    ])
    const result = await fetchSlackIdentity(OPTS)
    expect(result).toMatchObject({ picture: 'https://slack.test/avatar_192.png' })
  })

  it('image_192 が無ければ image_72 をアバターURLに使う', async () => {
    mockFetchSequence([
      { ok: true, authed_user: { id: 'U123', access_token: 'xoxp-test' }, team: { id: 'T999' } },
      { ok: true, user: { name: 'kanayama', profile: { image_72: 'https://slack.test/avatar_72.png' } } },
    ])
    expect(await fetchSlackIdentity(OPTS)).toMatchObject({ picture: 'https://slack.test/avatar_72.png' })
  })

  it('oauth.v2.access 失敗時は error を返す', async () => {
    mockFetchSequence([{ ok: false, error: 'invalid_code' }])
    expect(await fetchSlackIdentity(OPTS)).toEqual({ error: 'oauth: invalid_code' })
  })

  it('users.info 失敗時は error を返す', async () => {
    mockFetchSequence([
      { ok: true, authed_user: { id: 'U123', access_token: 'xoxp-test' }, team: { id: 'T999' } },
      { ok: false, error: 'user_not_found' },
    ])
    expect(await fetchSlackIdentity(OPTS)).toEqual({ error: 'usersInfo: user_not_found' })
  })

  it('ネットワークエラーは throw せず error を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    expect(await fetchSlackIdentity(OPTS)).toEqual({ error: 'network: ECONNRESET' })
  })
})
