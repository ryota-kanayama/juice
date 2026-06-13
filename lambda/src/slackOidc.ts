import { FETCH_TIMEOUT_MS } from './http'

export interface SlackIdentity {
  sub: string
  name: string
  teamId: string
  /** users.info の profile.email。取得できなければ undefined */
  email?: string
  /** Slack 旧ユーザー名（@ハンドル）= users.info の name。勤怠照合に使う */
  handle?: string
}

export interface SlackOidcError {
  error: string
}

/** Slack 標準 OAuth v2 の認可 URL を組み立てる（user_scope で本人トークンを得る） */
export function buildAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    user_scope: 'users:read,users:read.email',
    redirect_uri: opts.redirectUri,
    state: opts.state,
  })
  return `https://slack.com/oauth/v2/authorize?${params}`
}

interface OAuthAccessResponse {
  ok: boolean
  authed_user?: { id?: string; access_token?: string }
  team?: { id?: string }
  error?: string
}

interface UsersInfoResponse {
  ok: boolean
  user?: { name?: string; real_name?: string; profile?: { email?: string } }
  error?: string
}

/**
 * 認可コードを oauth.v2.access で交換し、users.info で本人情報を取得する。
 * 本人確認は users.info に依存するため、いずれの失敗も {error} を返す。
 */
export async function fetchSlackIdentity(opts: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}): Promise<SlackIdentity | SlackOidcError> {
  try {
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code: opts.code,
        redirect_uri: opts.redirectUri,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const token = (await tokenRes.json()) as OAuthAccessResponse
    const sub = token.authed_user?.id
    const accessToken = token.authed_user?.access_token
    const teamId = token.team?.id
    if (!token.ok || !sub || !accessToken || !teamId) {
      return { error: `oauth: ${token.error ?? 'unknown'}` }
    }

    const usersRes = await fetch(
      `https://slack.com/api/users.info?user=${encodeURIComponent(sub)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    )
    const usersInfo = (await usersRes.json()) as UsersInfoResponse
    if (!usersInfo.ok || !usersInfo.user) {
      return { error: `usersInfo: ${usersInfo.error ?? 'unknown'}` }
    }
    const u = usersInfo.user
    return {
      sub,
      name: u.real_name || u.name || sub,
      teamId,
      email: u.profile?.email,
      handle: u.name,
    }
  } catch (e) {
    return { error: `network: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}
