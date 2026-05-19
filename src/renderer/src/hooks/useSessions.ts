import { useState, useEffect, useCallback } from 'react'
import type { Session } from '../types/session'
import { formatLocalDate } from '../../../shared/sessionUtils'
import { appendRunningInterval, createManualSession, hasRunningInterval } from '../domain/session'
import { sessionRepository } from '../repositories/sessionRepository'

export interface SessionsState {
  today: string
  todaySessions: Session[]
  /** タイマー停止などで確定したセッションをリストに反映する */
  upsertToday: (session: Session) => void
  /** タイマー再開の即時反映用：稼働中区間を追加して state を更新する */
  applyStartMore: (session: Session) => void
  /** セッションを更新する（稼働中の場合はディスク書き込みをスキップ） */
  update: (session: Session) => Promise<void>
  /** 手動追加（区間なしの確定済みセッション） */
  add: (params: { name: string; projectCode: string; workCategory: string; totalTime: string }) => Promise<void>
  /** セッションを削除する */
  remove: (sessionId: string) => Promise<void>
}

/** 今日のセッション一覧と変更操作を統括する。フォーカス復帰時の日付更新も担う。 */
export function useSessions(): SessionsState {
  const [todaySessions, setTodaySessions] = useState<Session[]>([])
  const [today, setToday] = useState(() => formatLocalDate(Date.now()))
  const [yearMonth, setYearMonth] = useState(() => formatLocalDate(Date.now()).slice(0, 7))

  useEffect(() => {
    const handleFocus = (): void => {
      setToday(formatLocalDate(Date.now()))
      setYearMonth(formatLocalDate(Date.now()).slice(0, 7))
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  useEffect(() => {
    sessionRepository.list(yearMonth).then(sessions => {
      setTodaySessions(sessions.filter(s => s.date === today))
    })
  }, [today, yearMonth])

  const upsertToday = useCallback((session: Session): void => {
    setTodaySessions(prev => {
      const exists = prev.some(s => s.id === session.id)
      return exists ? prev.map(s => s.id === session.id ? session : s) : [...prev, session]
    })
  }, [])

  const applyStartMore = useCallback((session: Session): void => {
    setTodaySessions(prev => prev.map(s => s.id === session.id ? appendRunningInterval(s) : s))
  }, [])

  const update = useCallback(async (updated: Session): Promise<void> => {
    // 稼働中インターバルがある場合はディスク書き込みをスキップ（stop時に正しく保存される）
    if (!hasRunningInterval(updated)) {
      await sessionRepository.update(updated)
    }
    setTodaySessions(prev => prev.map(s => s.id === updated.id ? updated : s))
  }, [])

  const add = useCallback(async (params: { name: string; projectCode: string; workCategory: string; totalTime: string }): Promise<void> => {
    const session = createManualSession({
      name: params.name,
      projectCode: params.projectCode,
      workCategory: params.workCategory,
      totalMinutes: parseInt(params.totalTime, 10),
    })
    await sessionRepository.update(session)
    setTodaySessions(prev => [...prev, session])
  }, [])

  const remove = useCallback(async (sessionId: string): Promise<void> => {
    const session = todaySessions.find(s => s.id === sessionId)
    if (session) {
      await sessionRepository.remove(sessionId, session.date.slice(0, 7))
    }
    setTodaySessions(prev => prev.filter(s => s.id !== sessionId))
  }, [todaySessions])

  return { today, todaySessions, upsertToday, applyStartMore, update, add, remove }
}
