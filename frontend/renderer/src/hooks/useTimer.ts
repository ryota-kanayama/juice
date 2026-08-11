import { useState, useRef, useCallback, useEffect } from 'react'
import type { Session, WorkLocation } from '../types/session'
import { formatLocalDateTime, formatLocalDate } from '../../../shared/sessionUtils'
import { JUICE_COLOR_KEYS, randomColor } from '../domain/colors'
import { totalMinutesOf } from '../domain/session'
import { timerRepository } from '../repositories/timerRepository'
import { sessionRepository } from '../repositories/sessionRepository'
import { settingsRepository } from '../repositories/settingsRepository'

/** ジュースが満杯になるまでの秒数。経過時間通知ONならその間隔、OFFなら30分（経過時間通知のデフォルト間隔と同じ） */
const DEFAULT_FILL_SECONDS = 1800

/**
 * ディスクの最新の記録を返す。取れなければ fallback。
 *
 * 「もう一杯」から停止までの間に他のウィンドウで直された内容を、停止時の保存で
 * 消さないために使う。スナップショットのままだと、そのあいだの名前・PJコード・
 * 作業区分・時刻の修正が丸ごと消える。
 *
 * 読み込みに失敗した場合と、ディスクから消えていた場合は fallback を返す。
 * 計測ぶんを失うのは、直そうとしている問題より悪いため。
 */
async function latestSessionOr(fallback: Session): Promise<Session> {
  try {
    const list = await sessionRepository.list(fallback.date.slice(0, 7))
    return list.find(s => s.id === fallback.id) ?? fallback
  } catch {
    return fallback
  }
}

interface ResolvedFillSeconds {
  fillSeconds: number
  notificationEnabled: boolean
}

async function resolveFillSeconds(): Promise<ResolvedFillSeconds> {
  try {
    const { enabled, minutes } = await settingsRepository.getElapsed()
    return { fillSeconds: enabled ? minutes * 60 : DEFAULT_FILL_SECONDS, notificationEnabled: enabled }
  } catch {
    return { fillSeconds: DEFAULT_FILL_SECONDS, notificationEnabled: false }
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
  /** ジュース水位の計算専用の経過秒。満杯到達のたびに0へ周期リセットされる（elapsedSecondsは常に単調増加のまま） */
  juiceSeconds: number
  activeColor: string
  activeSessionId: string | null
  start: (name: string, color?: string, workLocation?: WorkLocation) => void
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
  const [cycleAnchorSeconds, setCycleAnchorSeconds] = useState(0)
  const [activeColor, setActiveColor] = useState<string>(JUICE_COLOR_KEYS[0])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const [isPaused, setIsPaused] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<Date | null>(null)
  const nameRef = useRef<string>('')
  const taskIdRef = useRef<string>('')
  const activeColorRef = useRef<string>(JUICE_COLOR_KEYS[0])
  const isRunningRef = useRef<boolean>(false)
  const stoppingRef = useRef<boolean>(false)
  const extendingSessionRef = useRef<Session | null>(null)
  const workLocationRef = useRef<WorkLocation | undefined>(undefined)
  const isPausedRef = useRef<boolean>(false)
  const pausedSecondsRef = useRef<number>(0)
  const elapsedSecondsRef = useRef<number>(0)
  const fillSecondsRef = useRef<number>(DEFAULT_FILL_SECONDS)
  const notificationEnabledRef = useRef<boolean>(false)
  const cycleAnchorSecondsRef = useRef<number>(0)

  const resetJuiceCycle = useCallback(() => {
    cycleAnchorSecondsRef.current = 0
    setCycleAnchorSeconds(0)
  }, [])

  const runTick = useCallback(() => {
    if (!startTimeRef.current) return
    const newElapsed = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
    elapsedSecondsRef.current = newElapsed
    setElapsedSeconds(newElapsed)
    // fillSeconds ごとにローカルで周期リセットする（通知ON/OFFに関わらず常に判定する）。
    // 通知ONのときはバックエンドの実発火イベント（onElapsedNotificationFired）でも
    // 個別に現在値へ再アンカーされるが、それが何らかの理由で届かない場合や、
    // 稼働中に通知設定がONからOFFへ切り替わった場合でも水位が張り付いたままにならないよう、
    // ローカル周期判定を常時のフォールバックとして機能させる。
    const fill = fillSecondsRef.current
    if (fill > 0) {
      let anchor = cycleAnchorSecondsRef.current
      while (newElapsed - anchor >= fill) {
        anchor += fill
      }
      if (anchor !== cycleAnchorSecondsRef.current) {
        cycleAnchorSecondsRef.current = anchor
        setCycleAnchorSeconds(anchor)
      }
    }
  }, [])

  useEffect(() => {
    return timerRepository.onElapsedNotificationFired(() => {
      if (!isRunningRef.current) return
      const anchor = elapsedSecondsRef.current
      cycleAnchorSecondsRef.current = anchor
      setCycleAnchorSeconds(anchor)
    })
  }, [])

  const start = useCallback((name: string, color?: string, workLocation?: WorkLocation) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    isPausedRef.current = false
    pausedSecondsRef.current = 0
    setIsPaused(false)
    extendingSessionRef.current = null
    workLocationRef.current = workLocation
    const c = color ?? randomColor()
    startTimeRef.current = new Date()
    nameRef.current = name
    taskIdRef.current = crypto.randomUUID()
    activeColorRef.current = c
    isRunningRef.current = true
    setActiveColor(c)
    setBaseSeconds(0)
    elapsedSecondsRef.current = 0
    setElapsedSeconds(0)
    resetJuiceCycle()
    setIsRunning(true)
    setActiveSessionId(null)
    setFillSeconds(DEFAULT_FILL_SECONDS)
    fillSecondsRef.current = DEFAULT_FILL_SECONDS
    notificationEnabledRef.current = false
    resolveFillSeconds().then(({ fillSeconds: fs, notificationEnabled }) => {
      fillSecondsRef.current = fs
      notificationEnabledRef.current = notificationEnabled
      setFillSeconds(fs)
    })
    timerRepository.started()
    intervalRef.current = setInterval(runTick, 1000)
  }, [resetJuiceCycle, runTick])

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
    elapsedSecondsRef.current = 0
    setElapsedSeconds(0)
    resetJuiceCycle()
    setIsRunning(true)
    setActiveSessionId(existingSession.id)
    setFillSeconds(DEFAULT_FILL_SECONDS)
    fillSecondsRef.current = DEFAULT_FILL_SECONDS
    notificationEnabledRef.current = false
    resolveFillSeconds().then(({ fillSeconds: fs, notificationEnabled }) => {
      fillSecondsRef.current = fs
      notificationEnabledRef.current = notificationEnabled
      setFillSeconds(fs)
    })
    timerRepository.started()
    intervalRef.current = setInterval(runTick, 1000)
  }, [resetJuiceCycle, runTick])

  const stop = useCallback(async (opts?: { projectCode?: string; workCategory?: string }): Promise<Session | null> => {
    if (!startTimeRef.current || !isRunningRef.current) return null
    // 保存中の再入を防ぐ。ディスクを読んでから書くため、二度押しすると2回目が
    // 1回目の書き込み後を読み、同じ区間が二重に記録される（new モードでも UUID の違う
    // レコードが2件保存される退行になるため、extend/new の両方に効かせる）。
    if (stoppingRef.current) return null
    stoppingRef.current = true
    try {
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
      const endMs = Date.now()
      // await を挟むと ref の絞り込みが失われるため、開始時刻も先に値として確定させる
      const startedAtMs = startTimeRef.current.getTime()
      const newInterval = {
        startTime: formatLocalDateTime(startedAtMs),
        endTime: formatLocalDateTime(endMs),
      }

      let resultSession: Session

      const extending = extendingSessionRef.current
      if (extending) {
        // extend mode: 既存セッションの times に追記する。
        //
        // 土台はディスクの最新にする。「もう一杯」した時点のスナップショットを土台にすると、
        // そのあいだにカレンダーで直した名前・PJコード・作業区分・時刻が丸ごと消える。
        // 終了時刻（endMs）は読み込みより前に確定させてあるので、読み込みにかかった時間が
        // 作業時間に混ざることはない。
        const base = await latestSessionOr(extending)
        // totalTime は「times が1つ以上あるならその合計と一致する派生値」という不変条件を守るため、
        // 原則として新しい times 全体から算出し直す（区間ごとに丸めて足すと 1分ずれ、
        // hasReliableTimes が false になって週表示の時間軸グリッドから消えてしまう）。
        // ただし停止前の totalTime が区間の合計と食い違う記録は、ユーザーが手で整えた合計
        // （あるいは times を持たないレガシー記録）なので、その値を消さずに加算で尊重する。
        const times = [...base.times, newInterval]
        const wasDerived = base.totalTime === totalMinutesOf(base.times)
        const addedMinutes = Math.round((endMs - startedAtMs) / 60000)
        resultSession = {
          ...base,
          projectCode: opts?.projectCode ?? base.projectCode,
          workCategory: opts?.workCategory ?? base.workCategory,
          totalTime: wasDerived ? totalMinutesOf(times) : base.totalTime + addedMinutes,
          times,
        }
      } else {
        // new mode: 新規セッションを作成（totalTime は区間から算出する）
        resultSession = {
          id: crypto.randomUUID(),
          taskId: taskIdRef.current,
          name: nameRef.current,
          projectCode: opts?.projectCode ?? '',
          workCategory: opts?.workCategory ?? '',
          totalTime: totalMinutesOf([newInterval]),
          times: [newInterval],
          date: formatLocalDate(startTimeRef.current.getTime()),
          color: activeColorRef.current,
          ...(workLocationRef.current === 'telework' ? { workLocation: 'telework' as const } : {}),
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
        intervalRef.current = setInterval(runTick, 1000)
        throw err
      }

      startTimeRef.current = null
      nameRef.current = ''
      taskIdRef.current = ''
      extendingSessionRef.current = null
      workLocationRef.current = undefined
      isRunningRef.current = false
      timerRepository.stopped()
      setIsRunning(false)
      setBaseSeconds(0)
      elapsedSecondsRef.current = 0
      setElapsedSeconds(0)
      resetJuiceCycle()
      setActiveSessionId(null)
      return resultSession
    } finally {
      stoppingRef.current = false
    }
  }, [resetJuiceCycle, runTick])

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
    workLocationRef.current = undefined
    isRunningRef.current = false
    timerRepository.stopped()
    setIsRunning(false)
    setBaseSeconds(0)
    elapsedSecondsRef.current = 0
    setElapsedSeconds(0)
    resetJuiceCycle()
    setActiveSessionId(null)
  }, [resetJuiceCycle])

  const adjustStartTime = useCallback((newStartDate: Date) => {
    if (newStartDate.getTime() >= Date.now()) return // 未来の時刻は無視
    startTimeRef.current = newStartDate
    const newElapsed = Math.floor((Date.now() - newStartDate.getTime()) / 1000)
    elapsedSecondsRef.current = newElapsed
    setElapsedSeconds(newElapsed)
    // 開始時刻がずれると cycleAnchorSeconds（旧タイムラインでの周期起点）が
    // 新しい elapsedSeconds と整合しなくなる（ジュースが数時間空のまま固まりうる）ため、
    // fillSeconds の倍数に合わせて再アンカーする。
    const fill = fillSecondsRef.current
    const nextAnchor = fill > 0 ? newElapsed - (newElapsed % fill) : 0
    cycleAnchorSecondsRef.current = nextAnchor
    setCycleAnchorSeconds(nextAnchor)
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
    intervalRef.current = setInterval(runTick, 1000)
  }, [runTick])

  const juiceSeconds = Math.max(0, elapsedSeconds - cycleAnchorSeconds)

  return { isRunning, isPaused, elapsedSeconds, baseSeconds, fillSeconds, juiceSeconds, activeColor, activeSessionId, start, startMore, stop, cancel, adjustStartTime, pause, resume }
}
