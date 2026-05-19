import type { Session } from '../types/session'

// 勤怠ドメイン: 勤怠報告に関する純粋なルール。React も IPC も知らない。

/** "HH:mm" を分に変換。不正な形式は null */
function parseHHMM(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** "HH:mm" 形式として妥当か */
export function isValidWorkTime(t: string | null): boolean {
  return !!t && /^\d{1,2}:\d{2}$/.test(t)
}

/** 勤怠報告テキストを生成する */
export function buildAttendanceText(
  sessions: Session[],
  workStart: string | null,
  workEnd: string | null,
  breakMinutes: number
): string {
  const map = new Map<string, { name: string; projectCode: string; workCategory: string; totalMinutes: number }>()

  for (const s of sessions) {
    const key = s.taskId ?? s.id
    const minutes = s.totalTime
    const existing = map.get(key)
    if (existing) {
      existing.totalMinutes += minutes
    } else {
      map.set(key, {
        name: s.name,
        projectCode: s.projectCode ?? '',
        workCategory: s.workCategory ?? '',
        totalMinutes: minutes,
      })
    }
  }

  const groups = Array.from(map.values()).filter(g => g.totalMinutes > 0)

  // 勤務時間から休憩を引いた実労働時間と、タイマー合計の差分を最後のタスクに加算
  if (groups.length > 0 && workStart && workEnd) {
    const startMin = parseHHMM(workStart)
    const endMin = parseHHMM(workEnd)
    if (startMin != null && endMin != null) {
      const actualWorkMinutes = endMin - startMin - breakMinutes
      const timerTotal = groups.reduce((sum, g) => sum + g.totalMinutes, 0)
      const diff = actualWorkMinutes - timerTotal
      if (diff > 0) {
        groups[groups.length - 1].totalMinutes += diff
      }
    }
  }

  const timeLine = `${workStart ?? ''} ${workEnd ?? ''} ${breakMinutes}`
  const taskLines = groups.map(g => `${g.projectCode} ${g.name} ${g.workCategory} ${g.totalMinutes}`)

  return ['勤怠', timeLine, ...taskLines].join('\n')
}
