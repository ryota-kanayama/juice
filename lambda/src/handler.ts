import { buildAuthorizeUrl, fetchSlackIdentity } from './slackOidc'
import { issueSessionJwt, verifySessionJwt, type SessionClaims } from './sessionJwt'
import { isRevoked } from './revocations'
import { buildTeleworkMessage, parseSlackPostRequest, postToSlack } from './slackPost'
import { parseAttendanceRequest, postAttendance, resolveUserName } from './attendanceSend'
import { postWhiteboard } from './whiteboardPost'
import { signState, verifyState } from './stateSign'
import { loadSecrets } from './secrets'

interface FunctionUrlEvent {
  rawPath: string
  queryStringParameters?: Record<string, string>
  headers: Record<string, string | undefined>
  body?: string
  isBase64Encoded?: boolean
  requestContext: { domainName: string; http: { method: string } }
}

interface FunctionUrlResponse {
  statusCode: number
  headers?: Record<string, string>
  body?: string
}

// アプリ側が生成する state（randomBytes(16).toString('hex') = 32文字）に合わせる
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`環境変数 ${name} が未設定`)
  return value
}

function redirect(location: string): FunctionUrlResponse {
  return { statusCode: 302, headers: { Location: location } }
}

function json(statusCode: number, data: unknown): FunctionUrlResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  }
}

async function bearerClaims(event: FunctionUrlEvent, sessionSecret: string): Promise<SessionClaims | null> {
  const auth = event.headers.authorization ?? event.headers.Authorization ?? ''
  const match = auth.match(/^Bearer (.+)$/)
  if (!match) return null
  const claims = verifySessionJwt(match[1], sessionSecret)
  if (!claims) return null
  // 失効チェックは JWT 検証成功後のみ行う（無効トークンの flood で DynamoDB を叩かせない）
  if (await isRevoked(claims.sub, claims.iat)) return null
  return claims
}

function rawBody(event: FunctionUrlEvent): string {
  return event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : (event.body ?? '')
}

// message には固定文言のみ渡す（ユーザー入力をエコーしない）
function errorPage(message: string): FunctionUrlResponse {
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Juice サインインエラー</title></head><body style="font-family:sans-serif;padding:2rem"><h1>サインインに失敗しました</h1><p>${message}</p><p>Juice アプリからやり直してください。</p></body></html>`,
  }
}

/**
 * サインイン完了ページ。deep link を自動発火してアプリに戻しつつ、
 * 「このタブは閉じてOK」と案内する。外部ブラウザのタブはこちらから自動で
 * 閉じられない（スクリプトで開いたタブではないため）ので明示する。
 * token を含むため no-store。deep link の & は HTML エスケープしない
 * （new URL でそのまま解釈できるようにする / 全ブラウザで動作）。
 */
function successPage(deepLink: string): FunctionUrlResponse {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Juice サインイン完了</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:2.5rem;text-align:center;color:#333"><h1 style="font-size:1.4rem;margin-bottom:.5rem">✅ サインイン完了</h1><p>Juice アプリに戻っています…</p><p style="color:#888;font-size:.9rem;margin-top:.75rem">自動で戻らない場合は下のボタンを押してください。<br>このタブは閉じて構いません。</p><p style="margin-top:1.5rem"><a href="${deepLink}" style="display:inline-block;padding:.6rem 1.4rem;background:#6b4eff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Juice を開く</a></p><script>location.href=${JSON.stringify(deepLink)}</script></body></html>`,
  }
}

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResponse> {
  const path = event.rawPath
  const query = event.queryStringParameters ?? {}
  const redirectUri = `https://${event.requestContext.domainName}/auth/callback`
  // 秘密値は SSM から取得する（コールド時のみ実取得、以降はキャッシュ）
  const secrets = await loadSecrets()

  if (path === '/auth/start') {
    const state = query.state ?? ''
    if (!STATE_PATTERN.test(state)) return errorPage('state パラメータが不正です。')
    // アプリの nonce に HMAC 署名と発行時刻を付けて Slack へ渡す。
    // /auth/callback で「自分が発行した state か・TTL 内か」を検証できるようにする。
    const signedState = signState(state, secrets.SESSION_SECRET)
    return redirect(
      buildAuthorizeUrl({ clientId: env('SLACK_CLIENT_ID'), redirectUri, state: signedState })
    )
  }

  if (path === '/auth/callback') {
    const code = query.code ?? ''
    // 署名済み state を検証し、元の nonce を取り出す（署名不一致・期限切れは拒否）
    const nonce = verifyState(query.state ?? '', secrets.SESSION_SECRET)
    if (!nonce || !code) return errorPage('パラメータが不足しています。')
    const identity = await fetchSlackIdentity({
      clientId: env('SLACK_CLIENT_ID'),
      clientSecret: secrets.SLACK_CLIENT_SECRET,
      code,
      redirectUri,
    })
    if ('error' in identity) {
      console.error('auth failed:', identity.error)
      return errorPage('Slack 認証に失敗しました。')
    }
    if (identity.teamId !== env('ALLOWED_TEAM_ID')) {
      console.error('team mismatch:', identity.teamId)
      return errorPage('許可されていないワークスペースです。')
    }
    const token = issueSessionJwt(
      {
        sub: identity.sub,
        name: identity.name,
        team: identity.teamId,
        email: identity.email,
        handle: identity.handle,
        picture: identity.picture,
      },
      secrets.SESSION_SECRET
    )
    // アプリは自身が生成した nonce で照合するため、署名前の nonce を返す
    return successPage(`juice://auth?token=${encodeURIComponent(token)}&state=${nonce}`)
  }

  if (path === '/auth/me') {
    const claims = await bearerClaims(event, secrets.SESSION_SECRET)
    if (!claims) return json(401, { error: 'unauthorized' })
    return json(200, { sub: claims.sub, name: claims.name, team: claims.team, exp: claims.exp })
  }

  if (path === '/api/slack.post' && event.requestContext.http.method === 'POST') {
    if (!(await bearerClaims(event, secrets.SESSION_SECRET))) return json(401, { error: 'unauthorized' })
    const request = parseSlackPostRequest(rawBody(event))
    if (!request) return json(400, { error: 'bad request' })
    const result = await postToSlack(buildTeleworkMessage(request), {
      botToken: secrets.SLACK_BOT_TOKEN,
      channelId: env('SLACK_CHANNEL_ID'),
    })
    if ('error' in result) {
      console.error('slack.post failed:', result.error)
      return json(502, { error: 'slack api error' })
    }
    return json(200, { ok: true })
  }

  if (path === '/api/attendance.send' && event.requestContext.http.method === 'POST') {
    const claims = await bearerClaims(event, secrets.SESSION_SECRET)
    if (!claims) return json(401, { error: 'unauthorized' })
    const request = parseAttendanceRequest(rawBody(event))
    if (!request) return json(400, { error: 'bad request' })
    const userName = resolveUserName(claims, process.env.ATTENDANCE_USER_OVERRIDES ?? '{}')
    const result = await postAttendance(userName, request.text, {
      apiUrl: env('ATTENDANCE_API_URL'),
      apiKey: secrets.ATTENDANCE_API_KEY,
    })
    if ('error' in result) {
      console.error('attendance.send failed:', result.error)
      return json(502, { error: 'attendance api error' })
    }
    if (!result.ok) {
      // 上流の非 2xx は内部情報（生 body）を返さず正規化する。body はログのみ。
      console.error('attendance.send upstream non-2xx:', result.status, result.body)
      return json(502, { error: 'attendance upstream error', status: result.status })
    }
    return json(200, { ok: true })
  }

  if (
    (path === '/api/whiteboard.telework' || path === '/api/whiteboard.leave') &&
    event.requestContext.http.method === 'POST'
  ) {
    const claims = await bearerClaims(event, secrets.SESSION_SECRET)
    if (!claims) return json(401, { error: 'unauthorized' })
    // email クレームは Phase 2 以降のサインインでのみ付与される
    if (!claims.email) return json(401, { error: 'reauth_required' })
    const kind = path === '/api/whiteboard.telework' ? 'telework' : 'leave'
    const result = await postWhiteboard(kind, claims.email, {
      apiUrl: env('WHITEBOARD_API_URL'),
      apiKey: secrets.WHITEBOARD_API_KEY,
    })
    if ('error' in result) {
      console.error('whiteboard failed:', result.error)
      return json(502, { error: 'whiteboard api error' })
    }
    return json(200, { ok: true })
  }

  return json(404, { error: 'not found' })
}
