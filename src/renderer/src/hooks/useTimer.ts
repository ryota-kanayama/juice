import { useState, useRef, useCallback } from 'react'
import type { Session } from '../types/session'
import { formatLocalDateTime, formatLocalDate } from '../../../shared/sessionUtils'
import { JUICE_COLOR_KEYS, randomColor } from '../domain/colors'
import { timerRepository } from '../repositories/timerRepository'
import { sessionRepository } from '../repositories/sessionRepository'
import { settingsRepository } from '../repositories/settingsRepository'

/** ジュースが満杯になるまでの秒数。経過時間通知ONならその間隔、OFFなら25分（ポモドーロの作業時間と同じ） */
const DEFAULT_FILL_SECONDS = 1500

async function resolveFillSeconds(): Promise<number> {
  try {
    const { enabled, minutes } = await settingsRepository.getElapsed()
    return enabled ? minutes * 60 : DEFAULT_FILL_SECONDS
  } catch {
    return DEFAULT_FILL_SECONDS
  }
}

export interface TimerState {
  isRunning: boolean
  isPaused: boolean
  elapsedSeconds: number
  /** 延長時に引き継ぐ累計秒（表示用オフセット）。新規タイマーでは0 */
  baseSeconds: number
  /** ジュース水位が満杯になるまでの秒数（タイマー開始時の設定で決まる） */
  fillSeconds: number
  activeColor: string
  activeSessionId: string | null
  start: (name: string, color?: string) => void
  startMore: (existingSession: Session) => void
  stop: (opts?: { projectCode?: string; workCategory?: string }) => Promise<Session | null>
  cancel: () => void
  adjustStartTime: (newStartDate: Date) => void
  pause: () => void
  resume: () => void
}

export function useTimer(): TimerState {
  const [isRunning, setIsRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [baseSeconds, setBaseSeconds] = useState(0)
  const [fillSeconds, setFillSeconds] = useState(DEFAULT_FILL_SECONDS)
  const [activeColor, setActiveColor] = useState<string>(JUICE_COLOR_KEYS[0])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const [isPaused, setIsPaused] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<Date | null>(null)
  const nameRef = useRef<string>('')
  const taskIdRef = useRef<string>('')
  const activeColorRef = useRef<string>(JUICE_COLOR_KEYS[0])
  const isRunningRef = useRef<boolean>(false)
  const extendingSessionRef = useRef<Session | null>(null)
  const isPausedRef = useRef<boolean>(false)
  const pausedSecondsRef = useRef<number>(0)

  const start = useCallback((name: string, color?: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    isPausedRef.current = false
    pausedSecondsRef.current = 0
    setIsPaused(false)
    extendingSessionRef.current = null
    const c = color ?? randomColor()
    startTimeRef.current = new Date()
    nameRef.current = name
    taskIdRef.current = crypto.randomUUID()
    activeColorRef.current = c
    isRunningRef.current = true
    setActiveColor(c)
    setBaseSeconds(0)
    setElapsedSeconds(0)
    setIsRunning(true)
    setActiveSessionId(null)
    setFillSeconds(DEFAULT_FILL_SECONDS)
    resolveFillSeconds().then(setFillSeconds)
    timerRepository.started()
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
      }
    }, 1000)
  }, [])

  const startMore = useCallback((existingSession: Session) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    isPausedRef.current = false
    pausedSecondsRef.current = 0
    setIsPaused(false)
    extendingSessionRef.current = existingSession
    startTimeRef.current = new Date()
    nameRef.current = existingSession.name
    taskIdRef.current = existingSession.taskId
    activeColorRef.current = existingSession.color
    isRunningRef.current = true
    setActiveColor(existingSession.color)
    setBaseSeconds(existingSession.totalTime * 60)
    setElapsedSeconds(0)
    setIsRunning(true)
    setActiveSessionId(existingSession.id)
    setFillSeconds(DEFAULT_FILL_SECONDS)
    resolveFillSeconds().then(setFillSeconds)
    timerRepository.started()
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
      }
    }, 1000)
  }, [])

  const stop = useCallback(async (opts?: { projectCode?: string; workCategory?: string }): Promise<Session | null> => {
    if (!startTimeRef.current || !isRunningRef.current) return null
    // pause 中に stop した場合は startTimeRef を巻き戻してから通常の stop 処理へ
    if (isPausedRef.current) {
      startTimeRef.current = new Date(Date.now() - pausedSecondsRef.current * 1000)
      isPausedRef.current = false
      setIsPaused(false)
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    const newInterval = {
      startTime: formatLocalDateTime(startTimeRef.current.getTime()),
      endTime: formatLocalDateTime(Date.now()),
    }

    let resultSession: Session

    const newIntervalMinutes = Math.round((Date.now() - startTimeRef.current.getTime()) / 60000)

    const extending = extendingSessionRef.current
    if (extending) {
      // extend mode: 既存セッションの times に追記し totalTime を加算
      resultSession = {
        ...extending,
        projectCode: opts?.projectCode ?? extending.projectCode,
        workCategory: opts?.workCategory ?? extending.workCategory,
        totalTime: extending.totalTime + newIntervalMinutes,
        times: [...extending.times, newInterval],
      }
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
        date: formatLocalDate(startTimeRef.current.getTime()),
        color: activeColorRef.current,
      }
    }

    try {
      if (extending) {
        await sessionRepository.update(resultSession)
      } else {
        await sessionRepository.save(resultSession)
      }
    } catch (err) {
      // 保存に失敗した場合は計測を止めずに継続させ、データロスを防ぐ。
      // interval を張り直し（開始時刻 ref は保持済み）、呼び出し側で再試行できるよう例外を伝播する。
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
        }
      }, 1000)
      throw err
    }

    startTimeRef.current = null
    nameRef.current = ''
    taskIdRef.current = ''
    extendingSessionRef.current = null
    isRunningRef.current = false
    timerRepository.stopped()
    setIsRunning(false)
    setBaseSeconds(0)
    setElapsedSeconds(0)
    setActiveSessionId(null)
    return resultSession
  }, [])

  const cancel = useCallback(() => {
    if (!isRunningRef.current) return
    isPausedRef.current = false
    pausedSecondsRef.current = 0
    setIsPaused(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    startTimeRef.current = null
    nameRef.current = ''
    taskIdRef.current = ''
    extendingSessionRef.current = null
    isRunningRef.current = false
    timerRepository.stopped()
    setIsRunning(false)
    setBaseSeconds(0)
    setElapsedSeconds(0)
    setActiveSessionId(null)
  }, [])

  const adjustStartTime = useCallback((newStartDate: Date) => {
    if (newStartDate.getTime() >= Date.now()) return // 未来の時刻は無視
    startTimeRef.current = newStartDate
    setElapsedSeconds(Math.floor((Date.now() - newStartDate.getTime()) / 1000))
    timerRepository.adjustStartTime(newStartDate.getTime())
  }, [])

  const pause = useCallback((): void => {
    if (!isRunningRef.current || isPausedRef.current) return
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    pausedSecondsRef.current = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
      : 0
    isPausedRef.current = true
    setIsPaused(true)
  }, [])

  const resume = useCallback((): void => {
    if (!isRunningRef.current || !isPausedRef.current) return
    startTimeRef.current = new Date(Date.now() - pausedSecondsRef.current * 1000)
    isPausedRef.current = false
    setIsPaused(false)
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
      }
    }, 1000)
  }, [])

  return { isRunning, isPaused, elapsedSeconds, baseSeconds, fillSeconds, activeColor, activeSessionId, start, startMore, stop, cancel, adjustStartTime, pause, resume }
}
