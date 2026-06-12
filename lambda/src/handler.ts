import { buildAuthorizeUrl, fetchSlackIdentity } from './slackOidc'
import { issueSessionJwt, verifySessionJwt } from './sessionJwt'

interface FunctionUrlEvent {
  rawPath: string
  queryStringParameters?: Record<string, string>
  headers: Record<string, string | undefined>
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

// message には固定文言のみ渡す（ユーザー入力をエコーしない）
function errorPage(message: string): FunctionUrlResponse {
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Juice サインインエラー</title></head><body style="font-family:sans-serif;padding:2rem"><h1>サインインに失敗しました</h1><p>${message}</p><p>Juice アプリからやり直してください。</p></body></html>`,
  }
}

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResponse> {
  const path = event.rawPath
  const query = event.queryStringParameters ?? {}
  const redirectUri = `https://${event.requestContext.domainName}/auth/callback`

  if (path === '/auth/start') {
    const state = query.state ?? ''
    if (!STATE_PATTERN.test(state)) return errorPage('state パラメータが不正です。')
    return redirect(
      buildAuthorizeUrl({ clientId: env('SLACK_CLIENT_ID'), redirectUri, state })
    )
  }

  if (path === '/auth/callback') {
    const state = query.state ?? ''
    const code = query.code ?? ''
    if (!STATE_PATTERN.test(state) || !code) return errorPage('パラメータが不足しています。')
    const identity = await fetchSlackIdentity({
      clientId: env('SLACK_CLIENT_ID'),
      clientSecret: env('SLACK_CLIENT_SECRET'),
      code,
      redirectUri,
    })
    if ('error' in identity) {
      console.error('OIDC failed:', identity.error)
      return errorPage('Slack 認証に失敗しました。')
    }
    if (identity.teamId !== env('ALLOWED_TEAM_ID')) {
      console.error('team mismatch:', identity.teamId)
      return errorPage('許可されていないワークスペースです。')
    }
    const token = issueSessionJwt(
      { sub: identity.sub, name: identity.name, team: identity.teamId, email: identity.email },
      env('SESSION_SECRET')
    )
    return redirect(`juice://auth?token=${encodeURIComponent(token)}&state=${state}`)
  }

  if (path === '/auth/me') {
    const auth = event.headers.authorization ?? event.headers.Authorization ?? ''
    const match = auth.match(/^Bearer (.+)$/)
    const claims = match ? verifySessionJwt(match[1], env('SESSION_SECRET')) : null
    if (!claims) return json(401, { error: 'unauthorized' })
    return json(200, { sub: claims.sub, name: claims.name, team: claims.team, exp: claims.exp })
  }

  return json(404, { error: 'not found' })
}
