// 区間入力の受け皿。UI は "HH:mm" だけを扱い、日付との結合はここで行う。
// 日付をまたぐ区間は作らない（同一日内で完結させる）。

import type { TimeInterval } from '../types/session'

export interface IntervalDraft {
  /** "HH:mm" */
  start: string
  /** "HH:mm"。稼働中は空文字 */
  end: string
  /** 稼働中の区間（終了時刻を編集させない） */
  running: boolean
}

const HHMM = /^\d{2}:\d{2}$/

/** "HH:mm" を 0:00 からの経過分に変換する。形式が不正なら null。 */
function minutesOf(hhmm: string): number | null {
  if (!HHMM.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** 保存済みの区間を入力用ドラフトへ変換する。 */
export function toIntervalDrafts(times: TimeInterval[]): IntervalDraft[] {
  return times.map(t => ({
    start: t.startTime.slice(11, 16),
    end: t.endTime ? t.endTime.slice(11, 16) : '',
    running: t.endTime === null,
  }))
}

/** 入力用ドラフトを、指定日の区間へ変換する。 */
export function toTimeIntervals(drafts: IntervalDraft[], date: string): TimeInterval[] {
  return drafts.map(d => ({
    startTime: `${date}T${d.start}:00`,
    endTime: d.running ? null : `${date}T${d.end}:00`,
  }))
}

/** すべての行が保存可能か。区間が0個なら不可。 */
export function isValidDrafts(drafts: IntervalDraft[]): boolean {
  if (drafts.length === 0) return false
  return drafts.every(d => {
    const start = minutesOf(d.start)
    if (start === null) return false
    if (d.running) return true
    const end = minutesOf(d.end)
    return end !== null && end > start
  })
}

/** 入力中の合計分。稼働中と不正な行は無視する。 */
export function draftMinutes(drafts: IntervalDraft[]): number {
  let total = 0
  for (const d of drafts) {
    if (d.running) continue
    const start = minutesOf(d.start)
    const end = minutesOf(d.end)
    if (start === null || end === null || end <= start) continue
    total += end - start
  }
  return total
}

/**
 * 手動追加の1行目の初期値。開始はその日の最後の記録の終了時刻、
 * 記録が無ければ勤務開始時刻、それも無ければ空にする。終了は常に空。
 * dayIntervals はその日の全セッションの区間を平坦化したもの。
 */
export function initialIntervalDraft(
  dayIntervals: TimeInterval[],
  workStart: string | null,
): IntervalDraft {
  const ends = dayIntervals
    .map(t => t.endTime)
    .filter((v): v is string => v !== null)
  const latest = ends.length > 0 ? ends.reduce((a, b) => (b > a ? b : a)) : null
  return {
    start: latest ? latest.slice(11, 16) : (workStart ?? ''),
    end: '',
    running: false,
  }
}
