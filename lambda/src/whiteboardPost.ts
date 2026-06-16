import { FETCH_TIMEOUT_MS } from './http'

// magnet_id: ホワイトボード上の状態を示す値（旧 src/main/integrations/whiteboard.ts と同じ）
const MAGNET_TELEWORK = 2
const MAGNET_LEAVE = 3

export type WhiteboardKind = 'telework' | 'leave'

/**
 * ホワイトボードの状態を更新する（attendance → magnet の2段呼び出し）。
 *
 * 打刻（attendance）を先に確定させ、表示ステータス（magnet）を後に更新する。
 * こうすると部分失敗しても誤表示が残らない:
 *   - 打刻が失敗 → magnet を呼ばないので、表示は直前の正しい状態のまま
 *   - magnet が失敗 → 打刻は記録済みで、表示は直前の正しい状態のまま
 * （magnet を先にすると「テレワーク中なのに打刻なし」や、補償削除で
 *   ボードから人が消える問題が起きるため、この順序にしている）
 * 失敗は {error}（throw しない）。
 */
export async function postWhiteboard(
  kind: WhiteboardKind,
  email: string,
  opts: { apiUrl: string; apiKey: string }
): Promise<{ ok: true } | { error: string }> {
  const magnetId = kind === 'telework' ? MAGNET_TELEWORK : MAGNET_LEAVE
  const comeToOffice = kind === 'telework'
  try {
    const attendance = await fetch(`${opts.apiUrl}/api/attendance?apiKey=${opts.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ come_to_the_office: String(comeToOffice), email }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!attendance.ok) return { error: `attendance: ${attendance.status}` }

    const magnet = await fetch(`${opts.apiUrl}/api/magnet?apiKey=${opts.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet_id: magnetId, email }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!magnet.ok) return { error: `magnet: ${magnet.status}` }
    return { ok: true }
  } catch (e) {
    return { error: `network: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}
