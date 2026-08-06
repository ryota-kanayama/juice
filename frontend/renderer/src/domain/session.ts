import type { Session, TimeInterval, WorkLocation } from '../types/session'
import { formatLocalDate, formatLocalDateTime } from '../../../shared/sessionUtils'
import { randomColor } from './colors'

export interface SessionEdit {
  name: string
  projectCode: string
  workCategory: string
  /** 編集後の合計分。null なら時間は変更しない */
  totalMinutes: number | null
}

/**
 * セッションの編集内容を適用する。稼働中セッションの合計時間を変更した場合は
 * 最後の区間の開始時刻を巻き戻し、その新しい開始時刻（ms）を adjustedStartMs で返す。
 */
export function applySessionEdit(
  session: Session,
  edit: SessionEdit
): { session: Session; adjustedStartMs?: number } {
  let updated: Session = {
    ...session,
    name: edit.name,
    projectCode: edit.projectCode,
    workCategory: edit.workCategory,
  }

  const { totalMinutes } = edit
  if (totalMinutes != null && totalMinutes >= 1) {
    const lastInterval = session.times[session.times.length - 1]
    if (lastInterval && !lastInterval.endTime) {
      // 稼働中: 合計が指定値になるよう最後の区間の開始時刻を調整
      const desiredElapsed = Math.max(1, totalMinutes - session.totalTime)
      const newStartMs = Date.now() - desiredElapsed * 60000
      updated = {
        ...updated,
        times: session.times.map(t =>
          t === lastInterval ? { ...t, startTime: formatLocalDateTime(newStartMs) } : t
        ),
      }
      return { session: updated, adjustedStartMs: newStartMs }
    }
    updated = { ...updated, totalTime: totalMinutes }
  }

  return { session: updated }
}

/** 手動追加用の新規セッションを組み立てる（区間なしの確定済みセッション） */
export function createManualSession(params: {
  name: string
  projectCode: string
  workCategory: string
  totalMinutes: number
  workLocation?: WorkLocation
}): Session {
  const id = crypto.randomUUID()
  return {
    id,
    taskId: id,
    name: params.name,
    projectCode: params.projectCode,
    workCategory: params.workCategory,
    times: [],
    date: formatLocalDate(Date.now()),
    color: randomColor(),
    totalTime: Math.max(1, params.totalMinutes),
    ...(params.workLocation === 'telework' ? { workLocation: 'telework' as const } : {}),
  }
}

/** セッションに稼働中の区間（endTime=null）を追加する。startMore のUI即時反映用。 */
export function appendRunningInterval(session: Session): Session {
  return {
    ...session,
    times: [...session.times, { startTime: formatLocalDateTime(Date.now()), endTime: null }],
  }
}

/** セッションのいずれかの区間が稼働中（endTime=null）か */
export function hasRunningInterval(session: Session): boolean {
  return session.times.some(t => t.endTime === null)
}

/** その日の作業時間帯（"HH:mm"）。稼働中の区間があるときは end が null。 */
export interface DayTimeRange {
  start: string
  end: string | null
}

/** "YYYY-MM-DDTHH:mm:ss" から "HH:mm" を取り出す。 */
function timeOf(localDateTime: string): string {
  return localDateTime.slice(11, 16)
}

/**
 * その日のセッション群から、最も早い開始時刻と最も遅い終了時刻を求める。
 * 区間が1つも無ければ null。稼働中の区間があれば終了時刻は未確定として null を返す。
 */
export function dayTimeRange(sessions: Session[]): DayTimeRange | null {
  const intervals = sessions.flatMap(s => s.times)
  if (intervals.length === 0) return null

  const start = intervals.reduce<string>(
    (earliest, t) => (t.startTime < earliest ? t.startTime : earliest),
    intervals[0].startTime
  )

  if (intervals.some(t => !t.endTime)) return { start: timeOf(start), end: null }

  const end = intervals.reduce<string>(
    (latest, t) => (t.endTime! > latest ? t.endTime! : latest),
    intervals[0].endTime!
  )
  return { start: timeOf(start), end: timeOf(end) }
}

/**
 * 完了区間の合計分。稼働中（endTime=null）の区間は含めない。
 * Rust の total_time_from_intervals と同じ丸め方をするが、区間が無い／すべて稼働中の
 * ときは 0 を返す（Rust 側は totalTime 欠落時のフォールバック専用で最低1分を返す）。
 */
export function totalMinutesOf(times: TimeInterval[]): number {
  let ms = 0
  let completed = 0
  for (const t of times) {
    if (!t.endTime) continue
    completed += 1
    ms += new Date(t.endTime).getTime() - new Date(t.startTime).getTime()
  }
  if (completed === 0) return 0
  return Math.max(1, Math.round(ms / 60000))
}

/**
 * 週表示の時間軸グリッドに出してよい記録か。
 * 区間を持ち、その合計が totalTime と一致していれば時刻を信用できる。
 * 稼働中の区間があるセッションは合計に経過が含まれず必ず食い違うため、常に信用する。
 */
export function hasReliableTimes(session: Session): boolean {
  if (session.times.length === 0) return false
  if (hasRunningInterval(session)) return true
  return totalMinutesOf(session.times) === session.totalTime
}
