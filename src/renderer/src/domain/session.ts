import type { Session } from '../types/session'
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

/** "YYYY-MM-DDTHH:mm:ss" の時刻部分を "HH:mm" で差し替える（日付は保持、秒は00） */
function replaceTimePart(dateTime: string, hhmm: string): string {
  return `${dateTime.slice(0, 10)}T${hhmm}:00`
}

/** 区間の長さ合計（分・四捨五入）。endTime=null の区間は0として扱う */
function sumIntervalMinutes(times: Session['times']): number {
  const totalMs = times.reduce((acc, t) => {
    if (!t.endTime) return acc
    return acc + (new Date(t.endTime).getTime() - new Date(t.startTime).getTime())
  }, 0)
  return Math.round(totalMs / 60000)
}

/**
 * 最初の区間の開始時刻と最後の区間の終了時刻（時刻 HH:mm のみ）を差し替え、
 * totalTime を全区間の長さ合計から再計算する。
 * 区間なし・稼働中・終了≤開始の場合は元のセッションをそのまま返す。
 */
export function applyTimeEdit(
  session: Session,
  edit: { startTime: string; endTime: string }
): Session {
  if (session.times.length === 0) return session
  const last = session.times[session.times.length - 1]
  if (!last.endTime) return session // 稼働中は対象外

  const first = session.times[0]
  const newStart = replaceTimePart(first.startTime, edit.startTime)
  const newEnd = replaceTimePart(last.endTime, edit.endTime)
  if (new Date(newEnd).getTime() <= new Date(newStart).getTime()) return session

  const times = session.times.map((t, i) => {
    if (i === 0 && i === session.times.length - 1) {
      return { ...t, startTime: newStart, endTime: newEnd }
    }
    if (i === 0) return { ...t, startTime: newStart }
    if (i === session.times.length - 1) return { ...t, endTime: newEnd }
    return t
  })

  return { ...session, times, totalTime: sumIntervalMinutes(times) }
}

/** 手動追加用の新規セッションを組み立てる（区間なしの確定済みセッション） */
export function createManualSession(params: {
  name: string
  projectCode: string
  workCategory: string
  totalMinutes: number
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
