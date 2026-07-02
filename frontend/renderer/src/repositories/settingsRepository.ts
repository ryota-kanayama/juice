// 設定のデータアクセス: window.bridge（IPC）への依存をこの層に閉じ込める。

export const settingsRepository = {
  getTheme(): Promise<string> {
    return window.bridge.getTheme()
  },
  setTheme(themeId: string): Promise<void> {
    return window.bridge.setTheme(themeId)
  },
  onThemeChanged(callback: (themeId: string) => void): () => void {
    return window.bridge.onThemeChanged(callback)
  },

  getIdle(): Promise<{ enabled: boolean; minutes: number }> {
    return window.bridge.getIdleSettings()
  },
  setIdle(enabled: boolean, minutes: number): Promise<void> {
    return window.bridge.setIdleSettings(enabled, minutes)
  },

  getElapsed(): Promise<{ enabled: boolean; minutes: number }> {
    return window.bridge.getElapsedSettings()
  },
  setElapsed(enabled: boolean, minutes: number): Promise<void> {
    return window.bridge.setElapsedSettings(enabled, minutes)
  },

  getPomodoro(): Promise<{ enabled: boolean }> {
    return window.bridge.getPomodoroSettings()
  },
  setPomodoro(enabled: boolean): Promise<void> {
    return window.bridge.setPomodoroSettings(enabled)
  },

  getWhiteboard(): Promise<{ enabled: boolean }> {
    return window.bridge.getWhiteboardSettings()
  },
  setWhiteboard(enabled: boolean): Promise<void> {
    return window.bridge.setWhiteboardSettings(enabled)
  },

  getBreakBehavior(): Promise<{ behavior: 'stop' | 'pause' }> {
    return window.bridge.getBreakBehaviorSettings()
  },
  setBreakBehavior(behavior: 'stop' | 'pause'): Promise<void> {
    return window.bridge.setBreakBehaviorSettings(behavior)
  },

  getMainProjectCode(): Promise<string> {
    return window.bridge.getMainProjectCode()
  },
  setMainProjectCode(code: string): Promise<void> {
    return window.bridge.setMainProjectCode(code)
  },

  getLaunchAtLogin(): Promise<boolean> {
    return window.bridge.getLaunchAtLogin()
  },
  setLaunchAtLogin(enabled: boolean): Promise<void> {
    return window.bridge.setLaunchAtLogin(enabled)
  },

  completeSetup(): Promise<void> {
    return window.bridge.completeSetup()
  },
}
