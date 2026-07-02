import { useState, useEffect, useMemo } from 'react'
import type { Session } from '../types/session'
import { buildSuggestions, previousYearMonth, type Suggestions } from '../domain/suggestions'
import { sessionRepository } from '../repositories/sessionRepository'

/** 今月・先月のセッションと当日セッション（メモリ上の最新）から入力候補を生成する */
export function useSuggestions(todaySessions: Session[], today: string): Suggestions {
  const [pastSessions, setPastSessions] = useState<Session[]>([])
  const yearMonth = today.slice(0, 7)

  useEffect(() => {
    Promise.all([
      sessionRepository.list(yearMonth),
      sessionRepository.list(previousYearMonth(yearMonth)),
    ])
      .then(([current, previous]) => setPastSessions([...current, ...previous]))
      // IPC 障害時は候補なしのまま続行する
      .catch(() => {})
  }, [yearMonth])

  return useMemo(() => {
    // 当日分はファイルより todaySessions を優先する（編集・追加が即反映される）
    const merged = [...pastSessions.filter(s => s.date !== today), ...todaySessions]
    return buildSuggestions(merged)
  }, [pastSessions, todaySessions, today])
}
