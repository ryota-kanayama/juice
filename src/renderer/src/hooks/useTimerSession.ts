import { useState, useCallback } from 'react'
import { useTimer } from './useTimer'
import type { SessionsState } from './useSessions'
import type { Session } from '../types/session'

export interface TimerSessionState {
  isRunning: boolean
  isPaused: boolean
  elapsedSeconds: number
  baseSeconds: number
  fillSeconds: number
  activeColor: string
  activeSessionId: string | null
  activeTimerName: string
  activeTimerProjectCode: string
  activeTimerWorkCategory: string
  today: string
  todaySessions: Session[]
  midnightSession: Session | null
  stopError: boolean
  start: (name: string, projectCode?: string, workCategory?: string) => void
  startMore: (session: Session) => void
  stop: (projectCode: string, workCategory: string) => Promise<void>
  stopForBreak: (projectCode: string, workCategory: string) => Promise<Session | null>
  cancel: () => void
  adjustStartTime: (date: Date) => void
  pause: () => void
  resume: () => void
  update: (session: Session) => Promise<void>
  add: (params: { name: string; projectCode: string; workCategory: string; totalTime: string }) => Promise<void>
  remove: (sessionId: string) => Promise<void>
  startTelework: () => Promise<void>
  dismissMidnightSession: () => void
  dismissStopError: () => void
}

export function useTimerSession(sessions: SessionsState): TimerSessionState {
  const timer = useTimer()
  const [activeTimerName, setActiveTimerName] = useState('')
  const [activeTimerProjectCode, setActiveTimerProjectCode] = useState('')
  const [activeTimerWorkCategory, setActiveTimerWorkCategory] = useState('')
  const [midnightSession, setMidnightSession] = useState<Session | null>(null)
  const [stopError, setStopError] = useState(false)

  const start = useCallback((name: string, projectCode = '', workCategory = ''): void => {
    setActiveTimerName(name)
    setActiveTimerProjectCode(projectCode)
    setActiveTimerWorkCategory(workCategory)
    timer.start(name)
  }, [timer])

  const startMore = useCallback((session: Session): void => {
    setActiveTimerName(session.name)
    setActiveTimerProjectCode(session.projectCode)
    setActiveTimerWorkCategory(session.workCategory)
    sessions.applyStartMore(session)
    timer.startMore(session)
  }, [timer, sessions])

  const stop = useCallback(async (projectCode: string, workCategory: string): Promise<void> => {
    let result: Session | null
    try {
      result = await timer.stop({ projectCode, workCategory })
    } catch (err) {
      console.error('セッションの保存に失敗しました:', err)
      setStopError(true)
      return
    }
    if (!result) return
    setStopError(false)
    if (result.date !== sessions.today) {
      setMidnightSession(result)
      return
    }
    sessions.upsertToday(result)
  }, [timer, sessions])

  const stopForBreak = useCallback(async (projectCode: string, workCategory: string): Promise<Session | null> => {
    let result: Session | null
    try {
      result = await timer.stop({ projectCode, workCategory })
    } catch (err) {
      console.error('セッションの保存に失敗しました:', err)
      setStopError(true)
      return null
    }
    if (!result) return null
    setStopError(false)
    if (result.date === sessions.today) {
      sessions.upsertToday(result)
    }
    return result
  }, [timer, sessions])

  const remove = useCallback(async (sessionId: string): Promise<void> => {
    if (sessionId === timer.activeSessionId) timer.cancel()
    await sessions.remove(sessionId)
  }, [timer, sessions])

  return {
    ...timer,
    activeTimerName,
    activeTimerProjectCode,
    activeTimerWorkCategory,
    today: sessions.today,
    todaySessions: sessions.todaySessions,
    midnightSession,
    stopError,
    start,
    startMore,
    stop,
    stopForBreak,
    cancel: timer.cancel,
    adjustStartTime: timer.adjustStartTime,
    pause: timer.pause,
    resume: timer.resume,
    update: sessions.update,
    add: sessions.add,
    remove,
    startTelework: sessions.startTelework,
    dismissMidnightSession: () => setMidnightSession(null),
    dismissStopError: () => setStopError(false),
  }
}
