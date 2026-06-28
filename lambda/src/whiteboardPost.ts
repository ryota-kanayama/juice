import { FETCH_TIMEOUT_MS } from './http'

// magnet_id: ホワイトボード上の状態を示す値（旧 src/main/integrations/whiteboard.ts と同じ）
const MAGNET_TELEWORK = 2
const MAGNET_LEAVE = 3

// ホワイトボード側 statusMagnetMap における magnet_id=3(退勤) のラベル。
// /api/users は magnet_id ではなくこのラベルを返すため文字列で比較する。
const LEAVE_LABEL = '退勤'

export type WhiteboardKind = 'telework' | 'leave'

/**
 * /api/users から現在のマグネット名を取得する。
 * 取得できない場合（ネットワークエラー・非2xx・ユーザー不在・想定外レスポンス）は null。
 * null のときは呼び出し側でフェイルセーフとして通常の退勤送信を行う。
 */
async function fetchCurrentMagnetName(
  email: string,
  opts: { apiUrl: string; apiKey: string }
): Promise<string | null> {
  try {
    const res = await fetch(
      `${opts.apiUrl}/api/users?apiKey=${opts.apiKey}&id=${encodeURIComponent(email)}`,
      { method: 'GET', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { results?: Array<{ magnet?: { name?: string } }> }
    const first = data.results?.[0]
    return first?.magnet?.name ?? null
  } catch {
    return null
  }
}

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
  // 退勤時にすでにマグネットが「退勤」なら、打刻も magnet も送らず no-op で成功扱いにする。
  // （出社時にカードをかざさず退勤のまま残ったケースで、無駄な退勤打刻を増やさない / issue #70）
  // 現在値が取得できないとき（null）は誤表示を避けるため通常どおり退勤を送る（フェイルセーフ）。
  if (kind === 'leave') {
    const current = await fetchCurrentMagnetName(email, opts)
    if (current === LEAVE_LABEL) return { ok: true }
  }
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
