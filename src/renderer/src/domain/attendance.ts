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

  let groups = Array.from(map.values()).filter(g => g.totalMinutes > 0)

  // 勤務時間から休憩を引いた実労働時間と、タイマー合計の差分を末尾のタスクから順に調整し、
  // 報告合計を実労働時間に一致させる。
  // - プラス差分（計測しきれなかった分）: 最後のタスクに加算
  // - マイナス差分（タイマー超過）: 最後のタスクから差し引き、負になる分は手前へ繰り越す
  if (groups.length > 0 && workStart && workEnd) {
    const startMin = parseHHMM(workStart)
    const endMin = parseHHMM(workEnd)
    if (startMin != null && endMin != null) {
      const actualWorkMinutes = endMin - startMin - breakMinutes
      const timerTotal = groups.reduce((sum, g) => sum + g.totalMinutes, 0)
      let diff = actualWorkMinutes - timerTotal
      for (let i = groups.length - 1; i >= 0 && diff !== 0; i--) {
        const adjusted = groups[i].totalMinutes + diff
        if (adjusted >= 0) {
          groups[i].totalMinutes = adjusted
          diff = 0
        } else {
          // このタスクで吸収しきれないマイナス分を手前へ繰り越す
          diff = adjusted
          groups[i].totalMinutes = 0
        }
      }
      // 調整で 0 になったタスクは報告から除く
      groups = groups.filter(g => g.totalMinutes > 0)
    }
  }

  const timeLine = `${workStart ?? ''} ${workEnd ?? ''} ${breakMinutes}`
  const taskLines = groups.map(g => `${g.projectCode} ${g.name} ${g.workCategory} ${g.totalMinutes}`)

  return ['勤怠', timeLine, ...taskLines].join('\n')
}
