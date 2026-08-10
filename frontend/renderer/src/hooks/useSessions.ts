import { useState, useEffect, useCallback } from 'react'
import type { Session, TimeInterval, WorkLocation } from '../types/session'
import { appendRunningInterval, createManualSession, hasRunningInterval, mergeRunningSessions } from '../domain/session'
import { sessionRepository } from '../repositories/sessionRepository'
import { attendanceRepository } from '../repositories/attendanceRepository'
import { useToday } from './useToday'

export interface SessionsState {
  today: string
  todaySessions: Session[]
  /** タイマー停止などで確定したセッションをリストに反映する */
  upsertToday: (session: Session) => void
  /** タイマー再開の即時反映用：稼働中区間を追加して state を更新する */
  applyStartMore: (session: Session) => void
  /** セッションを更新する（稼働中の場合はディスク書き込みをスキップ） */
  update: (session: Session) => Promise<void>
  /** 手動追加（区間を指定した確定済みセッション） */
  add: (params: { name: string; projectCode: string; workCategory: string; times: TimeInterval[] }, workLocation?: WorkLocation) => Promise<void>
  /** セッションを削除する */
  remove: (sessionId: string) => Promise<void>
  /** テレワーク開始をホワイトボード / Slack に通知する */
  startTelework: () => Promise<void>
}

/** 今日のセッション一覧と変更操作を統括する。日付は useToday（単一ソース）に従う。 */
export function useSessions(): SessionsState {
  const [todaySessions, setTodaySessions] = useState<Session[]>([])
  const today = useToday()
  const yearMonth = today.slice(0, 7)

  useEffect(() => {
    sessionRepository.list(yearMonth).then(sessions => {
      setTodaySessions(sessions.filter(s => s.date === today))
    })
  }, [today, yearMonth])

  // 他のウィンドウ（カレンダー）での変更を受け取って読み直す。
  // 稼働中の作業はディスクに無いので、手元のものを残す（mergeRunningSessions）。
  useEffect(() => {
    let alive = true
    const off = sessionRepository.onChanged(({ yearMonth: changed }) => {
      if (changed !== yearMonth) return
      sessionRepository.list(yearMonth)
        .then(sessions => {
          // today が変わったあとに解決した古い読み込みは捨てる
          if (!alive) return
          const fetched = sessions.filter(s => s.date === today)
          // prev を使うので、読み直しの最中に起きた変更も取りこぼさない
          setTodaySessions(prev => mergeRunningSessions(fetched, prev))
        })
        .catch(err => {
          // 失敗したら手元の内容を保つ。次の通知で再試行される
          console.error('[useSessions] 変更通知後の読み直しに失敗しました:', err)
        })
    })
    return () => { alive = false; off() }
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

  const add = useCallback(async (
    params: { name: string; projectCode: string; workCategory: string; times: TimeInterval[] },
    workLocation?: WorkLocation,
  ): Promise<void> => {
    const session = createManualSession({
      name: params.name,
      projectCode: params.projectCode,
      workCategory: params.workCategory,
      times: params.times,
      workLocation,
    })
    await sessionRepository.update(session)
    setTodaySessions(prev => [...prev, session])
  }, [])

  const remove = useCallback(async (sessionId: string): Promise<void> => {
    // todaySessions は date === today に絞られているため yearMonth は常に当月。
    // todaySessions に依存させず関数の再生成を防ぐ。
    await sessionRepository.remove(sessionId, yearMonth)
    setTodaySessions(prev => prev.filter(s => s.id !== sessionId))
  }, [yearMonth])

  const startTelework = useCallback(() => attendanceRepository.startTelework(), [])

  return { today, todaySessions, upsertToday, applyStartMore, update, add, remove, startTelework }
}
