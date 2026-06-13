import type { SessionClaims } from './sessionJwt'
import { FETCH_TIMEOUT_MS } from './http'

const MAX_TEXT_LENGTH = 2000

/** リクエストボディから text を取り出す。不正は null */
export function parseAttendanceRequest(body: string): { text: string } | null {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { text } = data as Record<string, unknown>
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_LENGTH) {
    return null
  }
  return { text }
}

/**
 * 勤怠の user_name を決める。優先順位は
 * 対応表（sub → 勤怠登録名）→ Slack 旧ハンドル → JWT の氏名
 * （Phase 4 設計メモの決定）。
 */
export function resolveUserName(
  claims: Pick<SessionClaims, 'sub' | 'name' | 'handle'>,
  overridesJson: string
): string {
  let overrides: Record<string, unknown> = {}
  try {
    overrides = JSON.parse(overridesJson)
  } catch {
    // 不正な JSON は対応表なしとして扱う
  }
  const override = overrides[claims.sub]
  if (typeof override === 'string') return override
  return claims.handle ?? claims.name
}

/**
 * 勤怠 API に送信する。ok（2xx か）と status、診断用の body を返す。
 * body は呼び出し側でログにのみ使い、クライアントへは透過しない（内部情報の漏えい防止）。
 * ネットワークエラー・タイムアウトは {error}。
 */
export async function postAttendance(
  userName: string,
  text: string,
  opts: { apiUrl: string; apiKey: string }
): Promise<{ ok: boolean; status: number; body: string } | { error: string }> {
  try {
    const res = await fetch(`${opts.apiUrl}?key=${opts.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ user_name: userName, text }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    return { ok: res.ok, status: res.status, body: await res.text() }
  } catch (e) {
    return { error: `network: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}
