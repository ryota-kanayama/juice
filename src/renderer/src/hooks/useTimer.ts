import { useState, useRef, useCallback } from 'react'
import type { Session } from '../types/session'
import { formatLocalDateTime } from '../../../shared/sessionUtils'

const JUICE_COLORS = [
  '#FF6B6B', // いちご
  '#FF9500', // オレンジ
  '#F7B731', // レモン
  '#e17055', // グレープフルーツ
  '#fd79a8', // もも
  '#a29bfe', // ぶどう
  '#45aaf2', // ブルーベリー
  '#0984e3', // カシス
  '#26de81', // マスカット
  '#00b894', // キウイ
]

function randomColor(): string {
  return JUICE_COLORS[Math.floor(Math.random() * JUICE_COLORS.length)]
}

function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export interface TimerState {
  isRunning: boolean
  elapsedSeconds: number
  activeColor: string
  activeSessionId: string | null
  start: (name: string, color?: string) => void
  startMore: (existingSession: Session) => void
  stop: (opts?: { projectCode?: string; workCategory?: string }) => Promise<Session | null>
  cancel: () => void
  adjustStartTime: (newStartDate: Date) => void
}

export function useTimer(): TimerState {
  const [isRunning, setIsRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [activeColor, setActiveColor] = useState(JUICE_COLORS[0])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<Date | null>(null)
  const nameRef = useRef<string>('')
  const taskIdRef = useRef<string>('')
  const activeColorRef = useRef<string>(JUICE_COLORS[0])
  const isRunningRef = useRef<boolean>(false)
  const extendingSessionRef = useRef<Session | null>(null)

  const start = useCallback((name: string, color?: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    extendingSessionRef.current = null
    const c = color ?? randomColor()
    startTimeRef.current = new Date()
    nameRef.current = name
    taskIdRef.current = crypto.randomUUID()
    activeColorRef.current = c
    isRunningRef.current = true
    setActiveColor(c)
    setElapsedSeconds(0)
    setIsRunning(true)
    setActiveSessionId(null)
    window.electronAPI.timerStarted()
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
      }
    }, 1000)
  }, [])

  const startMore = useCallback((existingSession: Session) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    extendingSessionRef.current = existingSession
    startTimeRef.current = new Date()
    nameRef.current = existingSession.name
    taskIdRef.current = existingSession.taskId
    activeColorRef.current = existingSession.color
    isRunningRef.current = true
    setActiveColor(existingSession.color)
    setElapsedSeconds(0)
    setIsRunning(true)
    setActiveSessionId(existingSession.id)
    window.electronAPI.timerStarted()
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
      }
    }, 1000)
  }, [])

  const stop = useCallback(async (opts?: { projectCode?: string; workCategory?: string }): Promise<Session | null> => {
    if (!startTimeRef.current || !isRunningRef.current) return null
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    const newInterval = {
      startTime: formatLocalDateTime(startTimeRef.current.getTime()),
      endTime: formatLocalDateTime(Date.now()),
    }

    let resultSession: Session

    const newIntervalMinutes = Math.max(1, Math.round((Date.now() - startTimeRef.current.getTime()) / 60000))

    if (extendingSessionRef.current) {
      // extend mode: 既存セッションの times に追記し totalTime を加算
      const existing = extendingSessionRef.current
      resultSession = {
        ...existing,
        projectCode: opts?.projectCode ?? existing.projectCode,
        workCategory: opts?.workCategory ?? existing.workCategory,
        totalTime: existing.totalTime + newIntervalMinutes,
        times: [...existing.times, newInterval],
      }
      await window.electronAPI.updateSession(resultSession)
    } else {
      // new mode: 新規セッションを作成
      resultSession = {
        id: crypto.randomUUID(),
        taskId: taskIdRef.current,
        name: nameRef.current,
        projectCode: opts?.projectCode ?? '',
        workCategory: opts?.workCategory ?? '',
        totalTime: newIntervalMinutes,
        times: [newInterval],
        date: toDateString(startTimeRef.current),
        color: activeColorRef.current,
      }
      await window.electronAPI.saveSession(resultSession)
    }

    startTimeRef.current = null
    nameRef.current = ''
    taskIdRef.current = ''
    extendingSessionRef.current = null
    isRunningRef.current = false
    window.electronAPI.timerStopped()
    setIsRunning(false)
    setElapsedSeconds(0)
    setActiveSessionId(null)
    return resultSession
  }, [])

  const cancel = useCallback(() => {
    if (!isRunningRef.current) return
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    startTimeRef.current = null
    nameRef.current = ''
    taskIdRef.current = ''
    extendingSessionRef.current = null
    isRunningRef.current = false
    window.electronAPI.timerStopped()
    setIsRunning(false)
    setElapsedSeconds(0)
    setActiveSessionId(null)
  }, [])

  const adjustStartTime = useCallback((newStartDate: Date) => {
    if (newStartDate.getTime() >= Date.now()) return // 未来の時刻は無視
    startTimeRef.current = newStartDate
    setElapsedSeconds(Math.floor((Date.now() - newStartDate.getTime()) / 1000))
    window.electronAPI.timerAdjustStartTime(newStartDate.getTime())
  }, [])

  return { isRunning, elapsedSeconds, activeColor, activeSessionId, start, startMore, stop, cancel, adjustStartTime }
}
