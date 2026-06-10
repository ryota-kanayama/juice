import { useState, useEffect } from 'react'
import { settingsRepository } from '../repositories/settingsRepository'

export interface SetupState {
  activeThemeId: string
  userName: string
  setUserName: (value: string) => void
  setTheme: (themeId: string) => void
  complete: () => Promise<void>
}

/** セットアップウィザードのオーケストレーション。テーマ即時反映と完了処理を統括。 */
export function useSetup(): SetupState {
  const [activeThemeId, setActiveThemeId] = useState('rose')
  const [userName, setUserNameState] = useState('')

  useEffect(() => {
    settingsRepository.getTheme().then(setActiveThemeId)
    settingsRepository.onThemeChanged(setActiveThemeId)
  }, [])

  return {
    activeThemeId,
    userName,
    setUserName: setUserNameState,
    setTheme: (themeId): void => {
      document.documentElement.dataset.theme = themeId
      setActiveThemeId(themeId)
      settingsRepository.setTheme(themeId)
    },
    complete: async (): Promise<void> => {
      await settingsRepository.setUserName(userName.trim())
      await settingsRepository.completeSetup()
    },
  }
}
