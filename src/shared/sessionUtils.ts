import type { Session, TimeInterval } from './types'

/** セッションの合計時間（分）。totalTime を返す */
export function calcSessionMinutes(session: Session): number {
  return session.totalTime
}

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

/**
 * 指定した区間が他セッションのインターバルと重複するか検査する
 * @param excludeSessionId 編集対象セッション（自己比較をスキップ）
 * @param newStart 新区間の開始ms
 * @param newEnd   新区間の終了ms
 */
export function hasIntervalOverlap(
  sessions: Session[],
  excludeSessionId: string,
  newStart: number,
  newEnd: number
): boolean {
  for (const session of sessions) {
    if (session.id === excludeSessionId) continue
    for (const t of session.times) {
      const tStart = new Date(t.startTime).getTime()
      const tEnd = t.endTime ? new Date(t.endTime).getTime() : Date.now()
      if (newStart < tEnd && newEnd > tStart) return true
    }
  }
  return false
}

/** Date を "HH:mm" 文字列に変換 */
export function formatTimeFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** TimeInterval を "HH:mm〜HH:mm"（完了）/ "HH:mm〜"（稼働中）に変換 */
export function formatInterval(t: TimeInterval): string {
  const start = new Date(t.startTime)
  const end = t.endTime ? new Date(t.endTime) : null
  return end
    ? `${formatTimeFromDate(start)}〜${formatTimeFromDate(end)}`
    : `${formatTimeFromDate(start)}〜`
}

/** 最初のインターバルの開始時刻でセッションを昇順ソート（新配列を返す） */
export function sortSessionsByStart(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aStart = a.times[0]?.startTime ?? ''
    const bStart = b.times[0]?.startTime ?? ''
    return aStart.localeCompare(bStart)
  })
}
