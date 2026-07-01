import type { Session } from './types'

/** ミリ秒をローカル日時文字列に変換（"YYYY-MM-DDTHH:mm:ss"） */
export function formatLocalDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** ミリ秒をローカル日付文字列に変換（"YYYY-MM-DD"） */
export function formatLocalDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date を "HH:mm" 文字列に変換 */
export function formatTimeFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 最初のインターバルの開始時刻でセッションを昇順ソート（新配列を返す） */
function sortSessionsByStart(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aStart = a.times[0]?.startTime ?? ''
    const bStart = b.times[0]?.startTime ?? ''
    return aStart.localeCompare(bStart)
  })
}

/** customOrder（セッションIDの並び）に従って並べ替える。含まれないものは時刻順で末尾に追加 */
export function orderSessions(sessions: Session[], customOrder: string[] | null): Session[] {
  if (!customOrder) return sortSessionsByStart(sessions)
  const byId = new Map(sessions.map(s => [s.id, s]))
  const ordered: Session[] = []
  for (const id of customOrder) {
    const s = byId.get(id)
    if (s) { ordered.push(s); byId.delete(id) }
  }
  for (const s of sortSessionsByStart([...byId.values()])) {
    ordered.push(s)
  }
  return ordered
}
