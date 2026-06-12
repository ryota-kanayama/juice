import { useState, useEffect } from 'react'
import { settingsRepository } from '../repositories/settingsRepository'
import { applyTheme } from '../theme/applyTheme'
import { DEFAULT_THEME_ID } from '../theme/themeParams'

export interface SetupState {
  activeThemeId: string
  setTheme: (themeId: string) => void
  complete: () => Promise<void>
}

/** セットアップウィザードのオーケストレーション。テーマ即時反映と完了処理を統括。 */
export function useSetup(): SetupState {
  const [activeThemeId, setActiveThemeId] = useState(DEFAULT_THEME_ID)

  useEffect(() => {
    settingsRepository.getTheme().then(setActiveThemeId)
    settingsRepository.onThemeChanged(setActiveThemeId)
  }, [])

  return {
    activeThemeId,
    setTheme: (themeId): void => {
      // 即時反映（IPC待ちなし）
      applyTheme(themeId)
      setActiveThemeId(themeId)
      settingsRepository.setTheme(themeId)
    },
    complete: async (): Promise<void> => {
      await settingsRepository.completeSetup()
    },
  }
}
