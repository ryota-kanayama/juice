export interface SlackIdentity {
  sub: string
  name: string
  teamId: string
  /** email スコープで取得。古い認可では undefined になりうる */
  email?: string
  /** Slack 旧ユーザー名（@ハンドル）。users.info から取得。取得失敗時は undefined */
  handle?: string
}

export interface SlackOidcError {
  error: string
}

/** Slack の OIDC 認可 URL を組み立てる */
export function buildAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    scope: 'openid profile email users:read',
    redirect_uri: opts.redirectUri,
    state: opts.state,
  })
  return `https://slack.com/openid/connect/authorize?${params}`
}

interface TokenResponse {
  ok: boolean
  access_token?: string
  error?: string
}

interface UserInfoResponse {
  ok: boolean
  sub?: string
  name?: string
  email?: string
  'https://slack.com/team_id'?: string
  error?: string
}

interface UsersInfoResponse {
  ok: boolean
  user?: { name?: string }
  error?: string
}

/**
 * 認可コードを交換し、userInfo で本人情報を取得する。
 * code は TLS で Slack と直接交換するため ID トークンの署名検証は不要。
 */
export async function fetchSlackIdentity(opts: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}): Promise<SlackIdentity | SlackOidcError> {
  try {
    const tokenRes = await fetch('https://slack.com/api/openid.connect.token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code: opts.code,
        redirect_uri: opts.redirectUri,
      }),
    })
    const token = (await tokenRes.json()) as TokenResponse
    if (!token.ok || !token.access_token) {
      return { error: `token: ${token.error ?? 'unknown'}` }
    }

    const userRes = await fetch('https://slack.com/api/openid.connect.userInfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    const user = (await userRes.json()) as UserInfoResponse
    const teamId = user['https://slack.com/team_id']
    if (!user.ok || !user.sub || !teamId) {
      return { error: `userInfo: ${user.error ?? 'unknown'}` }
    }
    // users.info の name は廃止された旧ユーザー名（@ハンドル）。勤怠 DB の
    // slack_user_name はこの値から登録されているため照合に使う。
    // 取得失敗はサインインを止めず handle を undefined にする。
    let handle: string | undefined
    try {
      const usersRes = await fetch(
        `https://slack.com/api/users.info?user=${encodeURIComponent(user.sub)}`,
        { headers: { Authorization: `Bearer ${token.access_token}` } }
      )
      const usersInfo = (await usersRes.json()) as UsersInfoResponse
      if (usersInfo.ok) handle = usersInfo.user?.name
    } catch {
      // users.info の失敗はサインインを止めない
    }
    return { sub: user.sub, name: user.name || user.sub, teamId, email: user.email, handle }
  } catch (e) {
    return { error: `network: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}
