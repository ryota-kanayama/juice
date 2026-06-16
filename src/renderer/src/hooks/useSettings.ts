import { useState, useEffect } from 'react'
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
  setTheme: (themeId: string) => void
  setIdle: (enabled: boolean, minutes: number) => void
  setElapsed: (enabled: boolean, minutes: number) => void
  setPomodoro: (enabled: boolean) => void
  setWhiteboard: (enabled: boolean) => void
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

  useEffect(() => {
    const offThemeChanged = settingsRepository.onThemeChanged(setActiveThemeId)
    settingsRepository.getTheme().then(setActiveThemeId)
    settingsRepository.getIdle().then(({ enabled, minutes }) => {
      setIdleEnabled(enabled)
      setIdleMinutes(minutes)
    })
    settingsRepository.getElapsed().then(({ enabled, minutes }) => {
      setElapsedEnabled(enabled)
      setElapsedMinutes(minutes)
    })
    settingsRepository.getPomodoro().then(({ enabled }) => {
      setPomodoroEnabled(enabled)
    })
    settingsRepository.getWhiteboard().then(({ enabled }) => {
      setWhiteboardEnabled(enabled)
    })
    return offThemeChanged
  }, [])

  return {
    activeThemeId, idleEnabled, idleMinutes, elapsedEnabled, elapsedMinutes, pomodoroEnabled,
    whiteboardEnabled,

    setTheme: (themeId): void => {
      // 即時反映（IPC待ちなし）
      applyTheme(themeId)
      setActiveThemeId(themeId)
      settingsRepository.setTheme(themeId)
    },
    setIdle: (enabled, minutes): void => {
      setIdleEnabled(enabled)
      setIdleMinutes(minutes)
      settingsRepository.setIdle(enabled, minutes)
    },
    setElapsed: (enabled, minutes): void => {
      setElapsedEnabled(enabled)
      setElapsedMinutes(minutes)
      settingsRepository.setElapsed(enabled, minutes)
    },
    setPomodoro: (enabled): void => {
      setPomodoroEnabled(enabled)
      settingsRepository.setPomodoro(enabled)
    },
    setWhiteboard: (enabled): void => {
      setWhiteboardEnabled(enabled)
      settingsRepository.setWhiteboard(enabled)
    },
  }
}
