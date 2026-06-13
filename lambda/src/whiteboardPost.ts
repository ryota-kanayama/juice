import { FETCH_TIMEOUT_MS } from './http'

// magnet_id: ホワイトボード上の状態を示す値（旧 src/main/integrations/whiteboard.ts と同じ）
const MAGNET_TELEWORK = 2
const MAGNET_LEAVE = 3

export type WhiteboardKind = 'telework' | 'leave'

/**
 * ホワイトボードの状態を更新する（magnet → attendance の2段呼び出し）。
 * magnet 失敗時は attendance を呼ばない。失敗は {error}（throw しない）。
 */
export async function postWhiteboard(
  kind: WhiteboardKind,
  email: string,
  opts: { apiUrl: string; apiKey: string }
): Promise<{ ok: true } | { error: string }> {
  const magnetId = kind === 'telework' ? MAGNET_TELEWORK : MAGNET_LEAVE
  const comeToOffice = kind === 'telework'
  try {
    const magnet = await fetch(`${opts.apiUrl}/api/magnet?apiKey=${opts.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet_id: magnetId, email }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!magnet.ok) return { error: `magnet: ${magnet.status}` }

    const attendance = await fetch(`${opts.apiUrl}/api/attendance?apiKey=${opts.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ come_to_the_office: String(comeToOffice), email }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!attendance.ok) return { error: `attendance: ${attendance.status}` }
    return { ok: true }
  } catch (e) {
    return { error: `network: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}
