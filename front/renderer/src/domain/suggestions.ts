import type { Session } from '../types/session'

export interface NameSuggestion {
  name: string
  projectCode: string
  workCategory: string
}

export interface Suggestions {
  names: NameSuggestion[]
  projectCodes: string[]
  workCategories: string[]
}

export const EMPTY_SUGGESTIONS: Suggestions = { names: [], projectCodes: [], workCategories: [] }

// 新しさの比較キー。最後の区間の開始時刻、区間がなければ日付。
// "YYYY-MM-DDTHH:mm:ss" と "YYYY-MM-DD" は辞書順比較で問題ない
function recencyKey(s: Session): string {
  return s.times[s.times.length - 1]?.startTime ?? s.date
}

/** 過去セッションから入力候補を生成する。新しい順・重複なし・空値除外 */
export function buildSuggestions(sessions: Session[]): Suggestions {
  const sorted = [...sessions].sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)))

  const names: NameSuggestion[] = []
  const projectCodes: string[] = []
  const workCategories: string[] = []
  const seenNames = new Set<string>()
  const seenCodes = new Set<string>()
  const seenCategories = new Set<string>()

  for (const s of sorted) {
    const name = s.name.trim()
    const code = s.projectCode.trim()
    const category = s.workCategory.trim()
    if (name && !seenNames.has(name)) {
      seenNames.add(name)
      names.push({ name, projectCode: code, workCategory: category })
    }
    if (code && !seenCodes.has(code)) {
      seenCodes.add(code)
      projectCodes.push(code)
    }
    if (category && !seenCategories.has(category)) {
      seenCategories.add(category)
      workCategories.push(category)
    }
  }

  return { names, projectCodes, workCategories }
}

/** "YYYY-MM" の前月を返す */
export function previousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
