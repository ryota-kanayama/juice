import type { Session } from '../types/session'

// 勤怠ドメイン: 勤怠報告に関する純粋なルール。React も IPC も知らない。

/** "HH:mm" を分に変換。不正な形式は null */
function parseHHMM(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** 休憩開始〜終了の差分を分で返す。どちらか null または逆順なら 60（デフォルト）。 */
export function calcBreakMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 60
  const s = parseHHMM(start)
  const e = parseHHMM(end)
  return (s != null && e != null && e > s) ? e - s : 60
}

/** "HH:mm" 形式として妥当か */
export function isValidWorkTime(t: string | null): boolean {
  return !!t && /^\d{1,2}:\d{2}$/.test(t)
}

export interface AttendanceTextResult {
  /** 勤怠システムへ送るテキスト */
  text: string
  /**
   * タイマー合計が実労働時間を超えた分数。超過がなければ null。
   * 超過時は自動調整せずこの値を警告として UI に表示する。
   */
  overageMinutes: number | null
}

/** 勤怠報告テキストを生成する */
export function buildAttendanceText(
  sessions: Session[],
  workStart: string | null,
  workEnd: string | null,
  breakMinutes: number
): AttendanceTextResult {
  const map = new Map<string, { name: string; projectCode: string; workCategory: string; totalMinutes: number }>()

  for (const s of sessions) {
    const key = s.taskId ?? s.id
    const minutes = s.totalTime
    const existing = map.get(key)
    if (existing) {
      existing.totalMinutes += minutes
    } else {
      map.set(key, {
        name: s.name.replace(/\s/g, ''),
        projectCode: s.projectCode ?? '',
        workCategory: s.workCategory ?? '',
        totalMinutes: minutes,
      })
    }
  }

  const groups = Array.from(map.values()).filter(g => g.totalMinutes > 0)

  let overageMinutes: number | null = null

  // 勤務時間から休憩を引いた実労働時間とタイマー合計を比較する。
  // - プラス差分（計測漏れ）: 最後のタスクに加算して合計を実労働時間に合わせる
  // - マイナス差分（タイマー超過）: 自動調整せず overageMinutes として返す
  if (groups.length > 0 && workStart && workEnd) {
    const startMin = parseHHMM(workStart)
    const endMin = parseHHMM(workEnd)
    if (startMin != null && endMin != null) {
      const actualWorkMinutes = endMin - startMin - breakMinutes
      const timerTotal = groups.reduce((sum, g) => sum + g.totalMinutes, 0)
      const diff = actualWorkMinutes - timerTotal
      if (diff > 0) {
        groups[groups.length - 1].totalMinutes += diff
      } else if (diff < 0) {
        overageMinutes = -diff
      }
    }
  }

  const timeLine = `${workStart ?? ''} ${workEnd ?? ''} ${breakMinutes}`
  const taskLines = groups.map(g => `${g.projectCode} ${g.name} ${g.workCategory} ${g.totalMinutes}`)

  return {
    text: ['勤怠', timeLine, ...taskLines].join('\n'),
    overageMinutes,
  }
}
