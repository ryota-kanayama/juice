// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler } from './handler'
import { issueSessionJwt } from './sessionJwt'
import { signState, verifyState } from './stateSign'
import { isRevoked } from './revocations'
import * as slackOidc from './slackOidc'
import * as attendanceSend from './attendanceSend'
import * as whiteboardPost from './whiteboardPost'

vi.mock('./slackOidc', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./slackOidc')>()
  return { ...mod, fetchSlackIdentity: vi.fn() }
})

vi.mock('./attendanceSend', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./attendanceSend')>()
  return { ...mod, postAttendance: vi.fn() }
})

vi.mock('./whiteboardPost', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./whiteboardPost')>()
  return { ...mod, postWhiteboard: vi.fn() }
})

// 秘密値は SSM 取得をモックする（テストでは固定値を返す）
vi.mock('./secrets', () => ({
  loadSecrets: vi.fn().mockResolvedValue({
    SLACK_CLIENT_SECRET: 'CSECRET',
    SESSION_SECRET: 'test-secret',
    ATTENDANCE_API_KEY: 'AKEY',
    WHITEBOARD_API_KEY: 'WKEY',
  }),
}))

// 失効チェックは既定で「失効なし」。失効ケースのテストでのみ true にする。
vi.mock('./revocations', () => ({ isRevoked: vi.fn().mockResolvedValue(false) }))

const STATE = 'a'.repeat(32)
// /auth/callback には署名済み state が渡される（/auth/start が発行した形式）
const SIGNED = signState(STATE, 'test-secret')

function makeEvent(
  rawPath: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
  options: { method?: string; body?: string } = {}
) {
  return {
    rawPath,
    queryStringParameters: query,
    headers,
    body: options.body,
    requestContext: {
      domainName: 'abc.lambda-url.ap-northeast-1.on.aws',
      http: { method: options.method ?? 'GET' },
    },
  }
}

beforeEach(() => {
  process.env.SLACK_CLIENT_ID = 'CID'
  process.env.SLACK_CLIENT_SECRET = 'CSECRET'
  process.env.ALLOWED_TEAM_ID = 'T999'
  process.env.SESSION_SECRET = 'test-secret'
  process.env.ATTENDANCE_API_URL = 'https://kintai.test/api'
  process.env.ATTENDANCE_API_KEY = 'AKEY'
  process.env.WHITEBOARD_API_URL = 'https://wb.test'
  process.env.WHITEBOARD_API_KEY = 'WKEY'
  process.env.ATTENDANCE_USER_OVERRIDES = '{"U_OVR":"override-name"}'
  vi.mocked(slackOidc.fetchSlackIdentity).mockReset()
  vi.mocked(attendanceSend.postAttendance).mockReset()
  vi.mocked(whiteboardPost.postWhiteboard).mockReset()
  vi.mocked(isRevoked).mockReset().mockResolvedValue(false)
})

describe('GET /auth/start', () => {
  it('Slack 認可 URL へ 302 リダイレクトし、state は署名済み（検証で元の nonce に戻る）', async () => {
    const res = await handler(makeEvent('/auth/start', { state: STATE }))
    expect(res.statusCode).toBe(302)
    const url = new URL(res.headers!.Location)
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize')
    const sentState = url.searchParams.get('state')!
    // 生の nonce ではなく署名済み state を渡す
    expect(sentState).not.toBe(STATE)
    expect(verifyState(sentState, 'test-secret')).toBe(STATE)
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
  it('本人確認 OK なら JWT 付きの完了ページを返す（deep link は元の nonce に戻る）', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({
      sub: 'U123', name: '金山', teamId: 'T999',
    })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: SIGNED }))
    expect(res.statusCode).toBe(200)
    expect(res.headers!['Content-Type']).toContain('text/html')
    const url = new URL(res.body!.match(/juice:\/\/[^"]+/)![0])
    expect(url.protocol).toBe('juice:')
    // アプリが照合できるよう、署名前の nonce を返す
    expect(url.searchParams.get('state')).toBe(STATE)
    expect(url.searchParams.get('token')!.split('.')).toHaveLength(3)
  })

  it('完了ページは「タブを閉じてOK」案内とアプリを開くリンクを含む', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({
      sub: 'U123', name: '金山', teamId: 'T999',
    })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: SIGNED }))
    expect(res.body).toContain('サインイン完了')
    expect(res.body).toContain('このタブは閉じて')
    expect(res.body).toContain('Juice を開く')
  })

  it('署名されていない（生の）state は 400 で拒否する', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({
      sub: 'U123', name: '金山', teamId: 'T999',
    })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: STATE }))
    expect(res.statusCode).toBe(400)
    expect(slackOidc.fetchSlackIdentity).not.toHaveBeenCalled()
  })

  it('別ワークスペースのユーザーは 400 エラーページ', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({
      sub: 'U123', name: 'x', teamId: 'T_OTHER',
    })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: SIGNED }))
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('許可されていないワークスペース')
  })

  it('交換失敗は 400 エラーページ', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({ error: 'token: bad' })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: SIGNED }))
    expect(res.statusCode).toBe(400)
  })

  it('code が無ければ 400', async () => {
    const res = await handler(makeEvent('/auth/callback', { state: SIGNED }))
    expect(res.statusCode).toBe(400)
  })

  it('handle 付き identity なら JWT に handle が入る', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({
      sub: 'U123', name: '金山', teamId: 'T999', handle: 'kanayama',
    })
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: SIGNED }))
    const url = new URL(res.body!.match(/juice:\/\/[^"]+/)![0])
    const token = url.searchParams.get('token')!
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'))
    expect(payload.handle).toBe('kanayama')
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

  it('失効済みユーザーの有効 JWT は 401（個別失効）', async () => {
    vi.mocked(isRevoked).mockResolvedValue(true)
    const token = issueSessionJwt({ sub: 'U123', name: '金山', team: 'T999' }, 'test-secret')
    const res = await handler(makeEvent('/auth/me', {}, { authorization: `Bearer ${token}` }))
    expect(res.statusCode).toBe(401)
    expect(isRevoked).toHaveBeenCalledWith('U123', expect.any(Number))
  })
})

describe('POST /api/attendance.send', () => {
  const BODY = JSON.stringify({ text: '勤怠\n8:30 17:30 60' })

  function makeAttEvent(body: string, token?: string) {
    const headers: Record<string, string> = {}
    if (token) headers.authorization = `Bearer ${token}`
    return makeEvent('/api/attendance.send', {}, headers, { method: 'POST', body })
  }

  it('JWT の name を user_name にして成功時は 200 {ok:true} に正規化する', async () => {
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const token = issueSessionJwt({ sub: 'U1', name: 'Ryota Kanayama', team: 'T999' }, 'test-secret')
    const res = await handler(makeAttEvent(BODY, token))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body!)).toEqual({ ok: true })
    expect(attendanceSend.postAttendance).toHaveBeenCalledWith(
      'Ryota Kanayama', '勤怠\n8:30 17:30 60', { apiUrl: 'https://kintai.test/api', apiKey: 'AKEY' }
    )
  })

  it('対応表にある sub は登録名で送る', async () => {
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ ok: true, status: 200, body: '{}' })
    const token = issueSessionJwt({ sub: 'U_OVR', name: '別名', team: 'T999' }, 'test-secret')
    await handler(makeAttEvent(BODY, token))
    expect(vi.mocked(attendanceSend.postAttendance).mock.calls[0][0]).toBe('override-name')
  })

  it('上流の非2xx は生 body を返さず 502 に正規化する', async () => {
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ ok: false, status: 400, body: '{"error_message":"x"}' })
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T999' }, 'test-secret')
    const res = await handler(makeAttEvent(BODY, token))
    expect(res.statusCode).toBe(502)
    expect(res.body).not.toContain('error_message')
    expect(JSON.parse(res.body!)).toEqual({ error: 'attendance upstream error', status: 400 })
  })

  it('JWT 無しは 401、text 不正は 400、ネットワークエラーは 502', async () => {
    expect((await handler(makeAttEvent(BODY))).statusCode).toBe(401)
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T999' }, 'test-secret')
    expect((await handler(makeAttEvent(JSON.stringify({ text: '' }), token))).statusCode).toBe(400)
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ error: 'network: x' })
    expect((await handler(makeAttEvent(BODY, token))).statusCode).toBe(502)
  })
})

describe('POST /api/whiteboard.*', () => {
  function makeWbEvent(path: string, token?: string) {
    const headers: Record<string, string> = {}
    if (token) headers.authorization = `Bearer ${token}`
    return makeEvent(path, {}, headers, { method: 'POST', body: '{}' })
  }

  it('email クレーム付き JWT で postWhiteboard を呼び 200', async () => {
    vi.mocked(whiteboardPost.postWhiteboard).mockResolvedValue({ ok: true })
    const token = issueSessionJwt(
      { sub: 'U1', name: 'a', team: 'T999', email: 'a@jsl.co.jp' }, 'test-secret'
    )
    const res = await handler(makeWbEvent('/api/whiteboard.telework', token))
    expect(res.statusCode).toBe(200)
    expect(whiteboardPost.postWhiteboard).toHaveBeenCalledWith(
      'telework', 'a@jsl.co.jp', { apiUrl: 'https://wb.test', apiKey: 'WKEY' }
    )
  })

  it('leave も kind が正しく渡る', async () => {
    vi.mocked(whiteboardPost.postWhiteboard).mockResolvedValue({ ok: true })
    const token = issueSessionJwt(
      { sub: 'U1', name: 'a', team: 'T999', email: 'a@jsl.co.jp' }, 'test-secret'
    )
    await handler(makeWbEvent('/api/whiteboard.leave', token))
    expect(vi.mocked(whiteboardPost.postWhiteboard).mock.calls[0][0]).toBe('leave')
  })

  it('email クレームの無い JWT は 401 reauth_required（API を呼ばない）', async () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T999' }, 'test-secret')
    const res = await handler(makeWbEvent('/api/whiteboard.telework', token))
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body!)).toEqual({ error: 'reauth_required' })
    expect(whiteboardPost.postWhiteboard).not.toHaveBeenCalled()
  })

  it('JWT 無しは 401、API 失敗は 502', async () => {
    expect((await handler(makeWbEvent('/api/whiteboard.telework'))).statusCode).toBe(401)
    vi.mocked(whiteboardPost.postWhiteboard).mockResolvedValue({ error: 'magnet: 500' })
    const token = issueSessionJwt(
      { sub: 'U1', name: 'a', team: 'T999', email: 'a@jsl.co.jp' }, 'test-secret'
    )
    expect((await handler(makeWbEvent('/api/whiteboard.telework', token))).statusCode).toBe(502)
  })
})

it('未知のパスは 404', async () => {
  expect((await handler(makeEvent('/nope'))).statusCode).toBe(404)
})
