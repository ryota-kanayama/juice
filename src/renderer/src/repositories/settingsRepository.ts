// 設定のデータアクセス: window.electronAPI（IPC）への依存をこの層に閉じ込める。

export const settingsRepository = {
  getTheme(): Promise<string> {
    return window.electronAPI.getTheme()
  },
  setTheme(themeId: string): Promise<void> {
    return window.electronAPI.setTheme(themeId)
  },
  onThemeChanged(callback: (themeId: string) => void): () => void {
    return window.electronAPI.onThemeChanged(callback)
  },

  getIdle(): Promise<{ enabled: boolean; minutes: number }> {
    return window.electronAPI.getIdleSettings()
  },
  setIdle(enabled: boolean, minutes: number): Promise<void> {
    return window.electronAPI.setIdleSettings(enabled, minutes)
  },

  getElapsed(): Promise<{ enabled: boolean; minutes: number }> {
    return window.electronAPI.getElapsedSettings()
  },
  setElapsed(enabled: boolean, minutes: number): Promise<void> {
    return window.electronAPI.setElapsedSettings(enabled, minutes)
  },

  getPomodoro(): Promise<{ enabled: boolean }> {
    return window.electronAPI.getPomodoroSettings()
  },
  setPomodoro(enabled: boolean): Promise<void> {
    return window.electronAPI.setPomodoroSettings(enabled)
  },

  getWhiteboard(): Promise<{ enabled: boolean }> {
    return window.electronAPI.getWhiteboardSettings()
  },
  setWhiteboard(enabled: boolean): Promise<void> {
    return window.electronAPI.setWhiteboardSettings(enabled)
  },

  getBreakBehavior(): Promise<{ behavior: 'stop' | 'pause' }> {
    return window.electronAPI.getBreakBehaviorSettings()
  },
  setBreakBehavior(behavior: 'stop' | 'pause'): Promise<void> {
    return window.electronAPI.setBreakBehaviorSettings(behavior)
  },

  completeSetup(): Promise<void> {
    return window.electronAPI.completeSetup()
  },
}
