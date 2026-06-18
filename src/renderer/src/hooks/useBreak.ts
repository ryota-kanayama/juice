import { useState, useRef, useCallback, useEffect } from 'react'
import { calcBreakMinutes } from '../domain/attendance'
import { settingsRepository } from '../repositories/settingsRepository'
import type { TimerSessionState } from './useTimerSession'
import type { WorkdayState } from './useWorkday'
import type { Session } from '../types/session'

export interface BreakState {
  isOnBreak: boolean
  handleBreakStart: (projectCode: string, workCategory: string) => Promise<void>
  handleBreakEnd: () => void
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function useBreak(ts: TimerSessionState, workday: WorkdayState): BreakState {
  const [isOnBreak, setIsOnBreak] = useState(false)
  const lastSessionRef = useRef<Session | null>(null)
  const behaviorRef = useRef<'stop' | 'pause'>('stop')

  useEffect(() => {
    settingsRepository.getBreakBehavior().then(({ behavior }) => {
      behaviorRef.current = behavior
    })
  }, [])

  const handleBreakStart = useCallback(async (projectCode: string, workCategory: string): Promise<void> => {
    if (behaviorRef.current === 'pause') {
      ts.pause()
    } else {
      if (ts.isRunning) {
        const session = await ts.stopForBreak(projectCode, workCategory)
        lastSessionRef.current = session
      }
    }
    workday.startBreak(nowHHMM())
    setIsOnBreak(true)
  }, [ts, workday])

  const handleBreakEnd = useCallback((): void => {
    const endTime = nowHHMM()
    workday.endBreak(endTime)
    workday.setBreakMinutes(calcBreakMinutes(workday.breakStart, endTime))
    setIsOnBreak(false)
    if (behaviorRef.current === 'pause') {
      ts.resume()
    } else if (lastSessionRef.current) {
      ts.startMore(lastSessionRef.current)
      lastSessionRef.current = null
    }
  }, [ts, workday])

  return { isOnBreak, handleBreakStart, handleBreakEnd }
}
