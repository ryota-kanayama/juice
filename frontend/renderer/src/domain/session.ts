import type { Session, TimeInterval, WorkLocation } from '../types/session'
import { formatLocalDate, formatLocalDateTime } from '../../../shared/sessionUtils'
import { randomColor } from './colors'

export interface SessionEdit {
  name: string
  projectCode: string
  workCategory: string
  /** 編集後の区間。時刻を持たないまま編集する（レガシー）なら null */
  times: TimeInterval[] | null
  /** times が null のときだけ使う合計分 */
  totalMinutes: number | null
}

/** 稼働中（endTime=null）の区間を返す。無ければ undefined。 */
function runningIntervalOf(times: TimeInterval[]): TimeInterval | undefined {
  return times.find(t => t.endTime === null)
}

/**
 * セッションの編集内容を適用する。
 * 区間を差し替えた場合は totalTime も区間の合計に合わせる（稼働中の区間は含めない）。
 * 稼働中区間の開始時刻を動かした場合は、その新しい開始時刻（ms）を adjustedStartMs で返す。
 */
export function applySessionEdit(
  session: Session,
  edit: SessionEdit
): { session: Session; adjustedStartMs?: number } {
  const base: Session = {
    ...session,
    name: edit.name,
    projectCode: edit.projectCode,
    workCategory: edit.workCategory,
  }

  // レガシー: 時刻を持たないまま合計だけ編集する
  if (edit.times === null) {
    const { totalMinutes } = edit
    if (totalMinutes != null && totalMinutes >= 1) {
      return { session: { ...base, totalTime: totalMinutes } }
    }
    return { session: base }
  }

  const times = edit.times
  const running = runningIntervalOf(times)
  const completed = totalMinutesOf(times)
  const updated: Session = {
    ...base,
    times,
    // completed は totalMinutesOf のルール通り: 完了区間が1つも無ければ0、
    // 1つでもあれば max(1, ...) が効くので下限1分。稼働中でも0になるのは
    // 「完了区間が無く稼働中区間だけ」のときだけ。
    totalTime: running ? completed : Math.max(1, completed),
  }

  const prevRunning = runningIntervalOf(session.times)
  if (running && prevRunning && running.startTime !== prevRunning.startTime) {
    return { session: updated, adjustedStartMs: new Date(running.startTime).getTime() }
  }
  return { session: updated }
}

/** 手動追加用の新規セッションを組み立てる。日付は最初の区間から決まる。 */
export function createManualSession(params: {
  name: string
  projectCode: string
  workCategory: string
  times: TimeInterval[]
  workLocation?: WorkLocation
}): Session {
  const id = crypto.randomUUID()
  const first = params.times[0]
  return {
    id,
    taskId: id,
    name: params.name,
    projectCode: params.projectCode,
    workCategory: params.workCategory,
    times: params.times,
    date: first ? first.startTime.slice(0, 10) : formatLocalDate(Date.now()),
    color: randomColor(),
    totalTime: Math.max(1, totalMinutesOf(params.times)),
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

/**
 * 読み直した結果に、ディスクにまだ無い稼働中の作業を残す。
 *
 * 稼働中の区間は停止するまでディスクに書かれない。同期の読み直しでディスクを素直に
 * 採ると、タイマーを回している最中に別の作業を保存した瞬間、稼働中の作業が一覧から消える。
 *
 * `fetched` を土台にし、`local` のうち稼働中のものを、同じ id があれば差し替え、
 * 無ければ末尾に足す。
 */
export function mergeRunningSessions(fetched: Session[], local: Session[]): Session[] {
  const runningById = new Map<string, Session>()
  for (const s of local) {
    if (hasRunningInterval(s)) runningById.set(s.id, s)
  }
  if (runningById.size === 0) return fetched

  const merged = fetched.map(s => runningById.get(s.id) ?? s)
  const seen = new Set(fetched.map(s => s.id))
  for (const [id, s] of runningById) {
    if (!seen.has(id)) merged.push(s)
  }
  return merged
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
