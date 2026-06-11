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
  userName: string
  whiteboardEnabled: boolean
  whiteboardEmail: string
  slackProjectCode: string
  slackProjectName: string
  setTheme: (themeId: string) => void
  setIdle: (enabled: boolean, minutes: number) => void
  setElapsed: (enabled: boolean, minutes: number) => void
  setPomodoro: (enabled: boolean) => void
  setUserName: (userName: string) => void
  setWhiteboard: (enabled: boolean, email: string) => void
  setSlack: (projectCode: string, projectName: string) => void
}

/** 設定画面のオーケストレーション。各設定の読み出し・即時反映・永続化を統括。 */
export function useSettings(): SettingsState {
  const [activeThemeId, setActiveThemeId] = useState(DEFAULT_THEME_ID)
  const [idleEnabled, setIdleEnabled] = useState(false)
  const [idleMinutes, setIdleMinutes] = useState(60)
  const [elapsedEnabled, setElapsedEnabled] = useState(false)
  const [elapsedMinutes, setElapsedMinutes] = useState(30)
  const [pomodoroEnabled, setPomodoroEnabled] = useState(false)
  const [userName, setUserNameState] = useState('')
  const [whiteboardEnabled, setWhiteboardEnabled] = useState(false)
  const [whiteboardEmail, setWhiteboardEmail] = useState('')
  const [slackProjectCode, setSlackProjectCode] = useState('')
  const [slackProjectName, setSlackProjectName] = useState('')

  useEffect(() => {
    settingsRepository.getTheme().then(setActiveThemeId)
    settingsRepository.onThemeChanged(setActiveThemeId)
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
    settingsRepository.getUserName().then(setUserNameState)
    settingsRepository.getWhiteboard().then(({ enabled, email }) => {
      setWhiteboardEnabled(enabled)
      setWhiteboardEmail(email)
    })
    settingsRepository.getSlack().then(({ projectCode, projectName }) => {
      setSlackProjectCode(projectCode)
      setSlackProjectName(projectName)
    })
  }, [])

  return {
    activeThemeId, idleEnabled, idleMinutes, elapsedEnabled, elapsedMinutes, pomodoroEnabled,
    userName, whiteboardEnabled, whiteboardEmail, slackProjectCode, slackProjectName,

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
    setUserName: (value): void => {
      setUserNameState(value)
      settingsRepository.setUserName(value.trim())
    },
    setWhiteboard: (enabled, email): void => {
      setWhiteboardEnabled(enabled)
      setWhiteboardEmail(email)
      settingsRepository.setWhiteboard(enabled, email.trim())
    },
    setSlack: (projectCode, projectName): void => {
      setSlackProjectCode(projectCode)
      setSlackProjectName(projectName)
      settingsRepository.setSlack(projectCode.trim(), projectName.trim())
    },
  }
}
