// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildAuthorizeUrl, fetchSlackIdentity } from './slackOidc'

const OPTS = {
  clientId: 'CID',
  clientSecret: 'CSECRET',
  code: 'CODE123',
  redirectUri: 'https://example.lambda-url.test/auth/callback',
}

const TOKEN_OK = { ok: true, authed_user: { id: 'U123', access_token: 'xoxp-test' }, team: { id: 'T999' } }
const userInfo = (user: Record<string, unknown>) => ({ ok: true, user })

/** fetch を、渡した順に JSON を返すモックに差し替える */
function stubFetch(...responses: object[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of responses) fn.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(r) })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('buildAuthorizeUrl', () => {
  const url = () => new URL(buildAuthorizeUrl({ clientId: 'CID', redirectUri: 'https://x/auth/callback', state: 'abc' }))

  it('Slack の OAuth 認可ページの URL を作る', () => {
    const result = url()

    expect(result.origin + result.pathname).toBe('https://slack.com/oauth/v2/authorize')
  })

  it('クライアント ID・コールバック先・state を載せる', () => {
    const { searchParams } = url()

    expect([searchParams.get('client_id'), searchParams.get('redirect_uri'), searchParams.get('state')])
      .toEqual(['CID', 'https://x/auth/callback', 'abc'])
  })

  it('ユーザー情報とメールアドレスの読み取り権限を求める', () => {
    const { searchParams } = url()

    expect(searchParams.get('user_scope')).toBe('users:read,users:read.email')
  })
})

describe('fetchSlackIdentity', () => {
  describe('成功したとき', () => {
    it('Slack のユーザー情報から本人の情報を組み立てる', async () => {
      stubFetch(TOKEN_OK, userInfo({ name: 'kanayama', real_name: '金山 良太', profile: { email: 'kanayama@jsl.co.jp' } }))

      const result = await fetchSlackIdentity(OPTS)

      expect(result).toEqual({ sub: 'U123', name: '金山 良太', teamId: 'T999', email: 'kanayama@jsl.co.jp', handle: 'kanayama' })
    })

    it('まず oauth.v2.access で、code とクライアントの秘密を送ってトークンに交換する', async () => {
      const fetchMock = stubFetch(TOKEN_OK, userInfo({ name: 'kanayama', profile: {} }))

      await fetchSlackIdentity(OPTS)

      const [url, init] = fetchMock.mock.calls[0]
      const body = new URLSearchParams(String(init.body))
      expect(url).toBe('https://slack.com/api/oauth.v2.access')
      expect([body.get('code'), body.get('client_secret')]).toEqual(['CODE123', 'CSECRET'])
    })

    it('次に users.info を、得たトークンで本人を指定して呼ぶ', async () => {
      const fetchMock = stubFetch(TOKEN_OK, userInfo({ name: 'kanayama', profile: {} }))

      await fetchSlackIdentity(OPTS)

      const [url, init] = fetchMock.mock.calls[1]
      expect(url).toBe('https://slack.com/api/users.info?user=U123')
      expect(init.headers.Authorization).toBe('Bearer xoxp-test')
    })

    it.each([
      ['real_name が無ければハンドル名', { name: 'kanayama', profile: {} }, 'kanayama'],
      ['どちらも無ければユーザー ID', { profile: {} }, 'U123'],
    ])('氏名は、%s を使う', async (_label, user, expected) => {
      stubFetch(TOKEN_OK, userInfo(user))

      const result = await fetchSlackIdentity(OPTS)

      expect(result).toMatchObject({ name: expected })
    })

    it.each([
      ['image_192 があればそれ', { image_192: 'https://slack.test/192.png', image_72: 'https://slack.test/72.png' }, 'https://slack.test/192.png'],
      ['image_192 が無ければ image_72', { image_72: 'https://slack.test/72.png' }, 'https://slack.test/72.png'],
    ])('アバターは %s を使う', async (_label, profile, expected) => {
      stubFetch(TOKEN_OK, userInfo({ name: 'kanayama', profile }))

      const result = await fetchSlackIdentity(OPTS)

      expect(result).toMatchObject({ picture: expected })
    })
  })

  describe('失敗したとき（例外は投げず error を返す）', () => {
    it('トークン交換に失敗したら oauth のエラー', async () => {
      stubFetch({ ok: false, error: 'invalid_code' })

      const result = await fetchSlackIdentity(OPTS)

      expect(result).toEqual({ error: 'oauth: invalid_code' })
    })

    it('ユーザー情報の取得に失敗したら usersInfo のエラー', async () => {
      stubFetch(TOKEN_OK, { ok: false, error: 'user_not_found' })

      const result = await fetchSlackIdentity(OPTS)

      expect(result).toEqual({ error: 'usersInfo: user_not_found' })
    })

    it('通信に失敗したら network のエラー', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

      const result = await fetchSlackIdentity(OPTS)

      expect(result).toEqual({ error: 'network: ECONNRESET' })
    })
  })
})
