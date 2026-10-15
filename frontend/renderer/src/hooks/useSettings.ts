import { useState, useEffect, useMemo } from 'react'
import { settingsRepository } from '../repositories/settingsRepository'
import { applyTheme } from '../theme/applyTheme'
import { DEFAULT_THEME_ID } from '../theme/themeParams'

export interface SettingsState {
  activeThemeId: string
  idleEnabled: boolean
  idleMinutes: number
  elapsedEnabled: boolean
  elapsedMinutes: number
  pomodoroEnabled: boolean
  whiteboardEnabled: boolean
  breakBehavior: 'stop' | 'pause'
  mainProjectCode: string
  launchAtLogin: boolean
  setTheme: (themeId: string) => void
  setIdle: (enabled: boolean, minutes: number) => void
  setElapsed: (enabled: boolean, minutes: number) => void
  setPomodoro: (enabled: boolean) => void
  setWhiteboard: (enabled: boolean) => void
  setBreakBehavior: (b: 'stop' | 'pause') => void
  setMainProjectCode: (code: string) => void
  setLaunchAtLogin: (enabled: boolean) => void
}

/**
 * 楽観反映した設定を保存する。保存に失敗したら原因を出し、ディスクの値を読み直して
 * 画面を戻す（画面だけが保存された設定と食い違ったままになるのを防ぐ）。
 * 読み直しも失敗したときは画面の値を保つ。返す Promise は reject しない。
 */
function persist(label: string, save: Promise<void>, reload: () => Promise<void>): Promise<void> {
  return Promise.resolve(save).catch((err: unknown) => {
    console.error(`[useSettings] ${label} の保存に失敗しました:`, err)
    return reload().catch((reloadErr: unknown) => {
      console.error(`[useSettings] ${label} の読み直しに失敗しました:`, reloadErr)
    })
  })
}

/** 設定画面のオーケストレーション。各設定の読み出し・即時反映・永続化を統括。 */
export function useSettings(): SettingsState {
  const [activeThemeId, setActiveThemeId] = useState(DEFAULT_THEME_ID)
  const [idleEnabled, setIdleEnabled] = useState(false)
  const [idleMinutes, setIdleMinutes] = useState(60)
  const [elapsedEnabled, setElapsedEnabled] = useState(false)
  const [elapsedMinutes, setElapsedMinutes] = useState(30)
  const [pomodoroEnabled, setPomodoroEnabled] = useState(false)
  const [whiteboardEnabled, setWhiteboardEnabled] = useState(false)
  const [breakBehavior, setBreakBehaviorState] = useState<'stop' | 'pause'>('stop')
  const [mainProjectCode, setMainProjectCodeState] = useState('')
  const [launchAtLogin, setLaunchAtLoginState] = useState(false)

  // ディスクから読んで画面へ反映する。初回の読み込みと、保存失敗時の巻き戻しで共用する
  const reloaders = useMemo(() => ({
    theme: () => settingsRepository.getTheme().then(setActiveThemeId),
    idle: () => settingsRepository.getIdle().then(({ enabled, minutes }) => {
      setIdleEnabled(enabled)
      setIdleMinutes(minutes)
    }),
    elapsed: () => settingsRepository.getElapsed().then(({ enabled, minutes }) => {
      setElapsedEnabled(enabled)
      setElapsedMinutes(minutes)
    }),
    pomodoro: () => settingsRepository.getPomodoro().then(({ enabled }) => setPomodoroEnabled(enabled)),
    whiteboard: () => settingsRepository.getWhiteboard().then(({ enabled }) => setWhiteboardEnabled(enabled)),
    breakBehavior: () => settingsRepository.getBreakBehavior().then(({ behavior }) => setBreakBehaviorState(behavior)),
    mainProjectCode: () => settingsRepository.getMainProjectCode().then(setMainProjectCodeState),
    launchAtLogin: () => settingsRepository.getLaunchAtLogin().then(setLaunchAtLoginState),
  }), [])

  useEffect(() => {
    const offThemeChanged = settingsRepository.onThemeChanged(setActiveThemeId)
    for (const [label, reload] of Object.entries(reloaders)) {
      // 失敗した設定は既定値のまま使い続ける
      reload().catch((err: unknown) => {
        console.error(`[useSettings] ${label} の読み込みに失敗しました:`, err)
      })
    }
    return offThemeChanged
  }, [reloaders])

  return {
    activeThemeId, idleEnabled, idleMinutes, elapsedEnabled, elapsedMinutes, pomodoroEnabled,
    whiteboardEnabled, breakBehavior, mainProjectCode, launchAtLogin,

    setTheme: (themeId): void => {
      // 即時反映（IPC待ちなし）
      applyTheme(themeId)
      setActiveThemeId(themeId)
      // 失敗時は画面の見た目もディスクのテーマに戻す
      void persist('theme', settingsRepository.setTheme(themeId), () =>
        settingsRepository.getTheme().then(diskThemeId => {
          applyTheme(diskThemeId)
          setActiveThemeId(diskThemeId)
        }))
    },
    setIdle: (enabled, minutes): void => {
      setIdleEnabled(enabled)
      setIdleMinutes(minutes)
      void persist('idle', settingsRepository.setIdle(enabled, minutes), reloaders.idle)
    },
    setElapsed: (enabled, minutes): void => {
      setElapsedEnabled(enabled)
      setElapsedMinutes(minutes)
      void persist('elapsed', settingsRepository.setElapsed(enabled, minutes), reloaders.elapsed)
    },
    setPomodoro: (enabled): void => {
      setPomodoroEnabled(enabled)
      void persist('pomodoro', settingsRepository.setPomodoro(enabled), reloaders.pomodoro)
    },
    setWhiteboard: (enabled): void => {
      setWhiteboardEnabled(enabled)
      void persist('whiteboard', settingsRepository.setWhiteboard(enabled), reloaders.whiteboard)
    },
    setBreakBehavior: (b): void => {
      setBreakBehaviorState(b)
      void persist('breakBehavior', settingsRepository.setBreakBehavior(b), reloaders.breakBehavior)
    },
    setMainProjectCode: (code): void => {
      setMainProjectCodeState(code)
      void persist('mainProjectCode', settingsRepository.setMainProjectCode(code), reloaders.mainProjectCode)
    },
    setLaunchAtLogin: (enabled): void => {
      setLaunchAtLoginState(enabled)
      void persist('launchAtLogin', settingsRepository.setLaunchAtLogin(enabled), reloaders.launchAtLogin)
    },
  }
}
