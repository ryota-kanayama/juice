// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler } from './handler'
import { issueSessionJwt } from './sessionJwt'
import * as slackOidc from './slackOidc'

vi.mock('./slackOidc', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./slackOidc')>()
  return { ...mod, fetchSlackIdentity: vi.fn() }
})

const STATE = 'a'.repeat(32)

function makeEvent(rawPath: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return {
    rawPath,
    queryStringParameters: query,
    headers,
    requestContext: { domainName: 'abc.lambda-url.ap-northeast-1.on.aws', http: { method: 'GET' } },
  }
}

beforeEach(() => {
  process.env.SLACK_CLIENT_ID = 'CID'
  process.env.SLACK_CLIENT_SECRET = 'CSECRET'
  process.env.ALLOWED_TEAM_ID = 'T999'
  process.env.SESSION_SECRET = 'test-secret'
  vi.mocked(slackOidc.fetchSlackIdentity).mockReset()
})

describe('GET /auth/start', () => {
  it('Slack 認可 URL へ 302 リダイレクトする', async () => {
    const res = await handler(makeEvent('/auth/start', { state: STATE }))
    expect(res.statusCode).toBe(302)
    const url = new URL(res.headers!.Location)
    expect(url.origin + url.pathname).toBe('https://slack.com/openid/connect/authorize')
    expect(url.searchParams.get('state')).toBe(STATE)
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://abc.lambda-url.ap-northeast-1.on.aws/auth/callback'
    )
  })

  it('state が不正なら 400', async () => {
    const res = await handler(makeEvent('/auth/start', { state: 'short' }))
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /auth/callback', () => {
  it('本人確認 OK なら JWT 付きで juice:// へ 302', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({
      sub: 'U123', name: '金山', teamId: 'T999',
    })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: STATE }))
    expect(res.statusCode).toBe(302)
    const url = new URL(res.headers!.Location)
    expect(url.protocol).toBe('juice:')
    expect(url.searchParams.get('state')).toBe(STATE)
    expect(url.searchParams.get('token')!.split('.')).toHaveLength(3)
  })

  it('別ワークスペースのユーザーは 400 エラーページ', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({
      sub: 'U123', name: 'x', teamId: 'T_OTHER',
    })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: STATE }))
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('許可されていないワークスペース')
  })

  it('交換失敗は 400 エラーページ', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({ error: 'token: bad' })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: STATE }))
    expect(res.statusCode).toBe(400)
  })

  it('code が無ければ 400', async () => {
    const res = await handler(makeEvent('/auth/callback', { state: STATE }))
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /auth/me', () => {
  it('有効な JWT なら 200 で claims を返す', async () => {
    const token = issueSessionJwt({ sub: 'U123', name: '金山', team: 'T999' }, 'test-secret')
    const res = await handler(makeEvent('/auth/me', {}, { authorization: `Bearer ${token}` }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body!)).toMatchObject({ sub: 'U123', name: '金山', team: 'T999' })
  })

  it('JWT 無し・改竄 JWT は 401', async () => {
    expect((await handler(makeEvent('/auth/me'))).statusCode).toBe(401)
    const res = await handler(makeEvent('/auth/me', {}, { authorization: 'Bearer xx.yy.zz' }))
    expect(res.statusCode).toBe(401)
  })
})

it('未知のパスは 404', async () => {
  expect((await handler(makeEvent('/nope'))).statusCode).toBe(404)
})
