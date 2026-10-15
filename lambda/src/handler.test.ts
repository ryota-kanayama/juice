// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handler } from './handler'
import { issueSessionJwt, verifySessionJwt, type SessionClaims } from './sessionJwt'
import { signState, verifyState } from './stateSign'
import { isRevoked } from './revocations'
import { loadSecrets } from './secrets'
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
// 秘密値は SSM からの取得をモックして固定値を返す
vi.mock('./secrets', () => ({
  loadSecrets: vi.fn().mockResolvedValue({
    SLACK_CLIENT_SECRET: 'CSECRET',
    SESSION_SECRET: 'test-secret',
    ATTENDANCE_API_KEY: 'AKEY',
    WHITEBOARD_API_KEY: 'WKEY',
  }),
}))
// 失効チェックは既定で「失効なし」
vi.mock('./revocations', () => ({ isRevoked: vi.fn() }))

const SECRET = 'test-secret'
const STATE = 'a'.repeat(32)
// /auth/callback には /auth/start が発行した署名済み state が渡される
const SIGNED = signState(STATE, SECRET)

type Claims = Omit<SessionClaims, 'iat' | 'exp'>

function makeEvent(
  rawPath: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
  options: { method?: string; body?: string; isBase64Encoded?: boolean } = {},
) {
  return {
    rawPath,
    queryStringParameters: query,
    headers,
    body: options.body,
    isBase64Encoded: options.isBase64Encoded,
    requestContext: {
      domainName: 'abc.lambda-url.ap-northeast-1.on.aws',
      http: { method: options.method ?? 'GET' },
    },
  }
}

const tokenFor = (claims: Partial<Claims> = {}): string =>
  issueSessionJwt({ sub: 'U1', name: 'a', team: 'T999', ...claims }, SECRET)

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

/** 完了ページの deep link（juice://auth?token&state）を取り出す */
function deepLinkOf(body: string | undefined): URL {
  return new URL(body!.match(/juice:\/\/[^"]+/)![0])
}

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'))
}

beforeEach(() => {
  process.env.SLACK_CLIENT_ID = 'CID'
  process.env.ALLOWED_TEAM_ID = 'T999'
  process.env.ATTENDANCE_API_URL = 'https://kintai.test/api'
  process.env.WHITEBOARD_API_URL = 'https://wb.test'
  process.env.ATTENDANCE_USER_OVERRIDES = '{"U_OVR":"override-name"}'
  vi.mocked(slackOidc.fetchSlackIdentity).mockReset()
  vi.mocked(attendanceSend.postAttendance).mockReset()
  vi.mocked(whiteboardPost.postWhiteboard).mockReset()
  vi.mocked(isRevoked).mockReset().mockResolvedValue(false)
})

describe('GET /auth/start', () => {
  async function start() {
    const res = await handler(makeEvent('/auth/start', { state: STATE }))
    return { res, url: new URL(res.headers!.Location) }
  }

  it('Slack の認可ページへ 302 でリダイレクトする', async () => {
    const { res, url } = await start()

    expect(res.statusCode).toBe(302)
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize')
  })

  it('アプリの nonce をそのままではなく、署名して渡す', async () => {
    const { url } = await start()

    const sent = url.searchParams.get('state')!

    expect(sent).not.toBe(STATE)
    expect(verifyState(sent, SECRET)).toBe(STATE)
  })

  it('コールバック先は Function URL の /auth/callback', async () => {
    const { url } = await start()

    expect(url.searchParams.get('redirect_uri')).toBe('https://abc.lambda-url.ap-northeast-1.on.aws/auth/callback')
  })

  it.each([
    ['短すぎる', 'short'],
    ['使えない文字を含む', `${'a'.repeat(20)}<script>`],
    ['無い', undefined],
  ])('state が%sなら 400', async (_label, state) => {
    const res = await handler(makeEvent('/auth/start', state === undefined ? {} : { state }))

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /auth/callback', () => {
  const identity = { sub: 'U123', name: '金山', teamId: 'T999' }

  async function callback(query: Record<string, string> = { code: 'C1', state: SIGNED }) {
    return handler(makeEvent('/auth/callback', query))
  }

  describe('本人確認に成功したとき', () => {
    beforeEach(() => {
      vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue(identity)
    })

    it('HTML の完了ページを返す', async () => {
      const res = await callback()

      expect(res.statusCode).toBe(200)
      expect(res.headers!['Content-Type']).toContain('text/html')
    })

    it('トークンを含むのでキャッシュさせない', async () => {
      const res = await callback()

      expect(res.headers!['Cache-Control']).toBe('no-store')
    })

    it('アプリへ戻る deep link に、署名前の nonce を入れる（アプリが照合できるように）', async () => {
      const res = await callback()

      expect(deepLinkOf(res.body).searchParams.get('state')).toBe(STATE)
    })

    it('deep link に、本人の情報を入れたセッション JWT を入れる', async () => {
      const res = await callback()

      const token = deepLinkOf(res.body).searchParams.get('token')!

      expect(verifySessionJwt(token, SECRET)).toMatchObject({ sub: 'U123', name: '金山', team: 'T999' })
    })

    it('handle があれば JWT に入れる', async () => {
      vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({ ...identity, handle: 'kanayama' })

      const res = await callback()

      expect(payloadOf(deepLinkOf(res.body).searchParams.get('token')!).handle).toBe('kanayama')
    })

    it('「タブは閉じてよい」案内とアプリを開くリンクを出す', async () => {
      const res = await callback()

      expect(res.body).toContain('サインイン完了')
      expect(res.body).toContain('このタブは閉じて')
      expect(res.body).toContain('Juice を開く')
    })
  })

  describe('拒否するとき', () => {
    it('署名されていない（生の）state は 400', async () => {
      const res = await callback({ code: 'C1', state: STATE })

      expect(res.statusCode).toBe(400)
    })

    it('署名されていない state なら Slack へ問い合わせない', async () => {
      await callback({ code: 'C1', state: STATE })

      expect(slackOidc.fetchSlackIdentity).not.toHaveBeenCalled()
    })

    it('code が無ければ 400', async () => {
      const res = await callback({ state: SIGNED })

      expect(res.statusCode).toBe(400)
    })

    it('Slack とのトークン交換に失敗したら 400', async () => {
      vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({ error: 'token: bad' })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await callback()

      expect(res.statusCode).toBe(400)
    })

    it('許可したワークスペース以外のユーザーは 400 で、その旨を出す', async () => {
      vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({ ...identity, teamId: 'T_OTHER' })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await callback()

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('許可されていないワークスペース')
    })
  })
})

describe('GET /auth/me', () => {
  it('有効な JWT なら 200 でクレームを返す', async () => {
    const token = tokenFor({ sub: 'U123', name: '金山' })

    const res = await handler(makeEvent('/auth/me', {}, bearer(token)))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body!)).toMatchObject({ sub: 'U123', name: '金山', team: 'T999' })
  })

  it('Authorization ヘッダーが大文字始まりでも受け付ける', async () => {
    const res = await handler(makeEvent('/auth/me', {}, { Authorization: `Bearer ${tokenFor()}` }))

    expect(res.statusCode).toBe(200)
  })

  it.each([
    ['JWT が無い', {}],
    ['JWT が改ざんされている', { authorization: 'Bearer xx.yy.zz' }],
    ['Bearer 形式でない', { authorization: 'Basic abc' }],
  ])('%s なら 401', async (_label, headers) => {
    const res = await handler(makeEvent('/auth/me', {}, headers))

    expect(res.statusCode).toBe(401)
  })

  it('失効させたユーザーの JWT は、署名が正しくても 401', async () => {
    vi.mocked(isRevoked).mockResolvedValue(true)

    const res = await handler(makeEvent('/auth/me', {}, bearer(tokenFor({ sub: 'U123' }))))

    expect(res.statusCode).toBe(401)
  })

  it('失効の確認は、ユーザーと発行時刻で行う', async () => {
    await handler(makeEvent('/auth/me', {}, bearer(tokenFor({ sub: 'U123' }))))

    expect(isRevoked).toHaveBeenCalledWith('U123', expect.any(Number))
  })

  it('JWT の検証に失敗したら、失効の確認（DynamoDB）はしない', async () => {
    await handler(makeEvent('/auth/me', {}, { authorization: 'Bearer xx.yy.zz' }))

    expect(isRevoked).not.toHaveBeenCalled()
  })
})

describe('POST /auth/refresh', () => {
  const refresh = (headers: Record<string, string>) =>
    handler(makeEvent('/auth/refresh', {}, headers, { method: 'POST' }))

  it('有効なトークンなら、クレームを引き継いだトークンを再発行する', async () => {
    const claims = { sub: 'U123', name: '金山', email: 'a@jsl.co.jp', handle: 'k', picture: 'p' }

    const res = await refresh(bearer(tokenFor(claims)))

    expect(verifySessionJwt(JSON.parse(res.body!).token, SECRET)).toMatchObject({ ...claims, team: 'T999' })
  })

  it.each([
    ['トークンが無い', {}],
    ['トークンが改ざんされている', { authorization: 'Bearer xx.yy.zz' }],
  ])('%s なら 401', async (_label, headers) => {
    const res = await refresh(headers)

    expect(res.statusCode).toBe(401)
  })

  it('失効させたユーザーのトークンは 401', async () => {
    vi.mocked(isRevoked).mockResolvedValue(true)

    const res = await refresh(bearer(tokenFor()))

    expect(res.statusCode).toBe(401)
  })

  it('GET では受け付けない（404）', async () => {
    const res = await handler(makeEvent('/auth/refresh', {}, bearer(tokenFor())))

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/attendance.send', () => {
  const TEXT = '勤怠\n8:30 17:30 60'

  function send(token: string | undefined, body = JSON.stringify({ text: TEXT }), options: { isBase64Encoded?: boolean } = {}) {
    return handler(makeEvent('/api/attendance.send', {}, token ? bearer(token) : {}, { method: 'POST', body, ...options }))
  }

  beforeEach(() => {
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ ok: true, status: 200, body: '{}' })
  })

  it('JWT の名前を送信者にして、勤怠 API へ送る', async () => {
    await send(tokenFor({ name: 'Ryota Kanayama' }))

    expect(attendanceSend.postAttendance).toHaveBeenCalledWith(
      'Ryota Kanayama', TEXT, { apiUrl: 'https://kintai.test/api', apiKey: 'AKEY' },
    )
  })

  it('成功したら 200 {ok:true} を返す', async () => {
    const res = await send(tokenFor())

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body!)).toEqual({ ok: true })
  })

  it('名前の対応表にあるユーザーは、登録された名前で送る', async () => {
    await send(tokenFor({ sub: 'U_OVR', name: '別名' }))

    expect(vi.mocked(attendanceSend.postAttendance).mock.calls[0][0]).toBe('override-name')
  })

  it('base64 で届いた本文も読める', async () => {
    const body = Buffer.from(JSON.stringify({ text: TEXT })).toString('base64')

    await send(tokenFor(), body, { isBase64Encoded: true })

    expect(vi.mocked(attendanceSend.postAttendance).mock.calls[0][1]).toBe(TEXT)
  })

  it('JWT が無ければ 401', async () => {
    const res = await send(undefined)

    expect(res.statusCode).toBe(401)
  })

  it('本文の text が空なら 400', async () => {
    const res = await send(tokenFor(), JSON.stringify({ text: '' }))

    expect(res.statusCode).toBe(400)
  })

  it('勤怠 API に届かなければ 502', async () => {
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ error: 'network: x' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await send(tokenFor())

    expect(res.statusCode).toBe(502)
  })

  it('勤怠 API の 2xx 以外は 502 に揃え、上流の本文は返さない', async () => {
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ ok: false, status: 400, body: '{"error_message":"x"}' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await send(tokenFor())

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body!)).toEqual({ error: 'attendance upstream error', status: 400 })
  })

  it('GET では受け付けない（404）', async () => {
    const res = await handler(makeEvent('/api/attendance.send', {}, bearer(tokenFor())))

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/whiteboard.*', () => {
  const withEmail = () => tokenFor({ email: 'a@jsl.co.jp' })

  function post(path: string, token?: string) {
    return handler(makeEvent(path, {}, token ? bearer(token) : {}, { method: 'POST', body: '{}' }))
  }

  beforeEach(() => {
    vi.mocked(whiteboardPost.postWhiteboard).mockResolvedValue({ ok: true })
  })

  it.each([
    ['/api/whiteboard.telework', 'telework'],
    ['/api/whiteboard.leave', 'leave'],
  ])('%s は、JWT のメールアドレスで %s を送る', async (path, kind) => {
    await post(path, withEmail())

    expect(whiteboardPost.postWhiteboard).toHaveBeenCalledWith(kind, 'a@jsl.co.jp', { apiUrl: 'https://wb.test', apiKey: 'WKEY' })
  })

  it('成功したら 200', async () => {
    const res = await post('/api/whiteboard.telework', withEmail())

    expect(res.statusCode).toBe(200)
  })

  it('JWT が無ければ 401', async () => {
    const res = await post('/api/whiteboard.telework')

    expect(res.statusCode).toBe(401)
  })

  it('メールアドレスを持たない（古い）JWT は 401 reauth_required で再サインインを促す', async () => {
    const res = await post('/api/whiteboard.telework', tokenFor())

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body!)).toEqual({ error: 'reauth_required' })
  })

  it('メールアドレスを持たない JWT ならホワイトボード API を呼ばない', async () => {
    await post('/api/whiteboard.telework', tokenFor())

    expect(whiteboardPost.postWhiteboard).not.toHaveBeenCalled()
  })

  it('ホワイトボード API が失敗したら 502', async () => {
    vi.mocked(whiteboardPost.postWhiteboard).mockResolvedValue({ error: 'magnet: 500' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await post('/api/whiteboard.telework', withEmail())

    expect(res.statusCode).toBe(502)
  })
})

it('知らないパスは 404', async () => {
  const res = await handler(makeEvent('/nope'))

  expect(res.statusCode).toBe(404)
})

describe('レスポンスの形', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('JSON のレスポンスは UTF-8 の application/json で返す', async () => {
    const res = await handler(makeEvent('/auth/me'))

    expect(res.headers).toEqual({ 'Content-Type': 'application/json; charset=utf-8' })
  })

  it('JWT が無い /auth/me は {error:"unauthorized"}', async () => {
    const res = await handler(makeEvent('/auth/me'))

    expect(JSON.parse(res.body!)).toEqual({ error: 'unauthorized' })
  })

  it('JWT が無い /auth/refresh は {error:"unauthorized"}', async () => {
    const res = await handler(makeEvent('/auth/refresh', {}, {}, { method: 'POST' }))

    expect(JSON.parse(res.body!)).toEqual({ error: 'unauthorized' })
  })

  it('JWT が無い勤怠送信は {error:"unauthorized"}', async () => {
    const res = await handler(makeEvent('/api/attendance.send', {}, {}, { method: 'POST', body: '{}' }))

    expect(JSON.parse(res.body!)).toEqual({ error: 'unauthorized' })
  })

  it('JWT が無いホワイトボード送信は {error:"unauthorized"}', async () => {
    const res = await handler(makeEvent('/api/whiteboard.leave', {}, {}, { method: 'POST', body: '{}' }))

    expect(JSON.parse(res.body!)).toEqual({ error: 'unauthorized' })
  })

  it('知らないパスは {error:"not found"}', async () => {
    const res = await handler(makeEvent('/nope'))

    expect(JSON.parse(res.body!)).toEqual({ error: 'not found' })
  })

  it('本文が不正な勤怠送信は {error:"bad request"}', async () => {
    const res = await handler(
      makeEvent('/api/attendance.send', {}, bearer(tokenFor()), { method: 'POST', body: JSON.stringify({ text: '' }) }),
    )

    expect(JSON.parse(res.body!)).toEqual({ error: 'bad request' })
  })

  it('勤怠 API に届かなければ {error:"attendance api error"}', async () => {
    vi.mocked(attendanceSend.postAttendance).mockResolvedValue({ error: 'network: x' })
    quiet()

    const res = await handler(
      makeEvent('/api/attendance.send', {}, bearer(tokenFor()), { method: 'POST', body: JSON.stringify({ text: 't' }) }),
    )

    expect(JSON.parse(res.body!)).toEqual({ error: 'attendance api error' })
  })

  it('ホワイトボードの送信に成功したら {ok:true}', async () => {
    vi.mocked(whiteboardPost.postWhiteboard).mockResolvedValue({ ok: true })

    const res = await handler(
      makeEvent('/api/whiteboard.telework', {}, bearer(tokenFor({ email: 'a@jsl.co.jp' })), { method: 'POST', body: '{}' }),
    )

    expect(JSON.parse(res.body!)).toEqual({ ok: true })
  })

  it('ホワイトボード API が失敗したら {error:"whiteboard api error"}', async () => {
    vi.mocked(whiteboardPost.postWhiteboard).mockResolvedValue({ error: 'magnet: 500' })
    quiet()

    const res = await handler(
      makeEvent('/api/whiteboard.leave', {}, bearer(tokenFor({ email: 'a@jsl.co.jp' })), { method: 'POST', body: '{}' }),
    )

    expect(JSON.parse(res.body!)).toEqual({ error: 'whiteboard api error' })
  })

  it('エラーページは UTF-8 の text/html で返す', async () => {
    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: 'unsigned' }))

    expect(res.headers).toEqual({ 'Content-Type': 'text/html; charset=utf-8' })
  })

  it('Slack 認証に失敗したら、その旨をエラーページに出す', async () => {
    vi.mocked(slackOidc.fetchSlackIdentity).mockResolvedValue({ error: 'token: bad' })
    quiet()

    const res = await handler(makeEvent('/auth/callback', { code: 'C1', state: SIGNED }))

    expect(res.body).toContain('Slack 認証に失敗しました')
  })
})

describe('Authorization ヘッダーの解釈', () => {
  const me = (authorization: string) => handler(makeEvent('/auth/me', {}, { authorization }))

  it('Bearer の前に余計な文字があれば 401', async () => {
    const res = await me(`x Bearer ${tokenFor()}`)

    expect(res.statusCode).toBe(401)
  })

  it('トークンの後ろに改行と余計な文字が続けば 401', async () => {
    const res = await me(`Bearer ${tokenFor()}\nextra`)

    expect(res.statusCode).toBe(401)
  })

  it('Bearer の後にトークンが無ければ 401', async () => {
    const res = await me('Bearer ')

    expect(res.statusCode).toBe(401)
  })
})

describe('GET /auth/start の state 検証', () => {
  const start = (state: string) => handler(makeEvent('/auth/start', { state }))

  it('16 文字の state は受け付ける（302）', async () => {
    const res = await start('a'.repeat(16))

    expect(res.statusCode).toBe(302)
  })

  it('128 文字の state は受け付ける（302）', async () => {
    const res = await start('a'.repeat(128))

    expect(res.statusCode).toBe(302)
  })

  it('15 文字の state は 400', async () => {
    const res = await start('a'.repeat(15))

    expect(res.statusCode).toBe(400)
  })

  it('129 文字の state は 400', async () => {
    const res = await start('a'.repeat(129))

    expect(res.statusCode).toBe(400)
  })

  it('先頭に使えない文字がある state は 400', async () => {
    const res = await start(`!${'a'.repeat(20)}`)

    expect(res.statusCode).toBe(400)
  })

  it('末尾に使えない文字がある state は 400', async () => {
    const res = await start(`${'a'.repeat(20)}!`)

    expect(res.statusCode).toBe(400)
  })

  it('state が無ければ 400', async () => {
    const res = await handler(makeEvent('/auth/start'))

    expect(res.statusCode).toBe(400)
  })

  it('エラーページは state の値をエコーしない', async () => {
    const res = await start('<script>alert(1)</script>')

    expect(res.body).not.toContain('<script>alert(1)</script>')
  })

  it('SLACK_CLIENT_ID が未設定ならエラーにする', async () => {
    delete process.env.SLACK_CLIENT_ID

    await expect(start('a'.repeat(32))).rejects.toThrow('環境変数 SLACK_CLIENT_ID が未設定')
  })
})

describe('ホワイトボード API のルーティング', () => {
  const withEmail = () => tokenFor({ email: 'a@jsl.co.jp' })

  it('GET では受け付けない（404）', async () => {
    const res = await handler(makeEvent('/api/whiteboard.telework', {}, bearer(withEmail())))

    expect(res.statusCode).toBe(404)
  })

  it('知らない種類は POST でも 404', async () => {
    const res = await handler(makeEvent('/api/whiteboard.other', {}, bearer(withEmail()), { method: 'POST', body: '{}' }))

    expect(res.statusCode).toBe(404)
  })
})

describe('内部で例外が起きたとき', () => {
  const CAUSE = 'ProvisionedThroughputExceeded: table=juice-revocations'
  const withEmail = () => tokenFor({ email: 'a@jsl.co.jp' })
  const post = (path: string, body = '{}') =>
    handler(makeEvent(path, {}, bearer(withEmail()), { method: 'POST', body }))

  // DynamoDB（失効チェック）を使う各ルート
  const routes: Array<[string, () => ReturnType<typeof handler>]> = [
    ['GET /auth/me', () => handler(makeEvent('/auth/me', {}, bearer(withEmail())))],
    ['POST /auth/refresh', () => post('/auth/refresh')],
    ['POST /api/attendance.send', () => post('/api/attendance.send', JSON.stringify({ text: 't' }))],
    ['POST /api/whiteboard.telework', () => post('/api/whiteboard.telework')],
    ['POST /api/whiteboard.leave', () => post('/api/whiteboard.leave')],
  ]

  let errorLog: ReturnType<typeof vi.spyOn>
  const loggedText = () => errorLog.mock.calls.flat().map(String).join(' ')

  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    errorLog.mockClear()
    vi.mocked(isRevoked).mockRejectedValue(new Error(CAUSE))
  })

  it.each(routes)('%s で DynamoDB が失敗したら 500', async (_label, request) => {
    const res = await request()

    expect(res.statusCode).toBe(500)
  })

  it.each(routes)('%s で DynamoDB が失敗したら本文は {error:"internal error"}', async (_label, request) => {
    const res = await request()

    expect(JSON.parse(res.body!)).toEqual({ error: 'internal error' })
  })

  it.each(routes)('%s で DynamoDB が失敗しても、上流の例外メッセージを返さない', async (_label, request) => {
    const res = await request()

    expect(res.body).not.toContain(CAUSE)
  })

  it.each(routes)('%s で DynamoDB が失敗したら、原因を console.error に出す', async (_label, request) => {
    await request()

    expect(loggedText()).toContain(CAUSE)
  })

  it('SSM（秘密値の取得）が失敗したら 500 で {error:"internal error"}', async () => {
    vi.mocked(loadSecrets).mockRejectedValueOnce(new Error(CAUSE))

    const res = await handler(makeEvent('/auth/me', {}, bearer(withEmail())))

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body!)).toEqual({ error: 'internal error' })
  })

  it('SSM が失敗しても、上流の例外メッセージを返さない', async () => {
    vi.mocked(loadSecrets).mockRejectedValueOnce(new Error(CAUSE))

    const res = await handler(makeEvent('/auth/me', {}, bearer(withEmail())))

    expect(res.body).not.toContain(CAUSE)
  })

  it('SSM が失敗したら、原因を console.error に出す', async () => {
    vi.mocked(loadSecrets).mockRejectedValueOnce(new Error(CAUSE))

    await handler(makeEvent('/auth/me', {}, bearer(withEmail())))

    expect(loggedText()).toContain(CAUSE)
  })

  it('勤怠 API の呼び出しが例外を投げたら 500 で {error:"internal error"}', async () => {
    vi.mocked(isRevoked).mockResolvedValue(false)
    vi.mocked(attendanceSend.postAttendance).mockRejectedValue(new Error(CAUSE))

    const res = await post('/api/attendance.send', JSON.stringify({ text: 't' }))

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body!)).toEqual({ error: 'internal error' })
  })

  it('ホワイトボード API の呼び出しが例外を投げたら 500 で {error:"internal error"}', async () => {
    vi.mocked(isRevoked).mockResolvedValue(false)
    vi.mocked(whiteboardPost.postWhiteboard).mockRejectedValue(new Error(CAUSE))

    const res = await post('/api/whiteboard.telework')

    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body!)).toEqual({ error: 'internal error' })
  })
})
