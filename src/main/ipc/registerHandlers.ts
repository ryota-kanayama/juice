import { app } from 'electron'
import type { SessionStore } from '../sessionStore'
import type { SettingsStore } from '../settingsStore'
import type { AuthStore } from '../auth/authStore'
import { startSignIn } from '../auth/signIn'
import { logger } from '../logger'
import { handle } from './handle'
import { hidePopover, resizePopover } from '../windows/popover'
import { getSetupWindow } from '../windows/setup'
import { createTray } from '../windows/tray'
import { broadcastThemeToAll } from '../windows/themeBroadcast'
import { broadcastAuthToAll } from '../windows/authBroadcast'
import { startIdleCheck } from '../notifications/idle'
import { recordActivity } from '../notifications/activity'
import { onTimerStarted, onTimerStopped, onTimerAdjustStartTime, reschedule } from '../notifications/elapsed'
import * as pomodoro from '../notifications/pomodoro'
import { sendAttendance } from '../integrations/attendance'
import { sendSlackTeleworkStart } from '../integrations/slack'
import { sendWhiteboardTeleworkStart } from '../integrations/whiteboard'
import { getHolidays } from '../integrations/holidays'
import { shell } from 'electron'

/** すべての IPC ハンドラを登録する */
export function registerIpcHandlers(
  sessionStore: SessionStore,
  settingsStore: SettingsStore,
  authStore: AuthStore,
): void {
  // sessions
  handle('sessions:get', (_, yearMonth) => sessionStore.getSessions(yearMonth))
  handle('sessions:save', async (_, session) => {
    await sessionStore.saveSession(session)
    recordActivity()
  })
  handle('sessions:update', async (_, session) => {
    await sessionStore.updateSession(session)
    recordActivity()
  })
  handle('sessions:delete', async (_, { id, yearMonth }) => {
    await sessionStore.deleteSession(id, yearMonth)
  })

  // settings: theme
  handle('settings:getTheme', () => settingsStore.getTheme())
  handle('settings:setTheme', async (_, themeId) => {
    await settingsStore.setTheme(themeId)
    broadcastThemeToAll(themeId)
  })

  // settings: notifications
  handle('settings:getIdleSettings', () => settingsStore.getIdleSettings())
  handle('settings:setIdleSettings', async (_, { enabled, minutes }) => {
    await settingsStore.setIdleSettings(enabled, minutes)
    // 設定変更時はアイドルクロックをリセットして即時通知を防ぐ
    recordActivity()
    await startIdleCheck(settingsStore)
  })
  handle('settings:getElapsedSettings', () => settingsStore.getElapsedSettings())
  handle('settings:setElapsedSettings', async (_, { enabled, minutes }) => {
    await settingsStore.setElapsedSettings(enabled, minutes)
    reschedule(settingsStore)
  })
  handle('settings:getPomodoroSettings', () => settingsStore.getPomodoroSettings())
  handle('settings:setPomodoroSettings', async (_, { enabled }) => {
    await settingsStore.setPomodoroSettings(enabled)
    pomodoro.reschedule(settingsStore)
  })

  // settings: integrations
  handle('settings:getWhiteboardSettings', () => settingsStore.getWhiteboardSettings())
  handle('settings:setWhiteboardSettings', async (_, { enabled }) => {
    await settingsStore.setWhiteboardSettings(enabled)
  })
  handle('settings:getSlackSettings', () => settingsStore.getSlackSettings())
  handle('settings:setSlackSettings', async (_, { projectCode, projectName }) => {
    await settingsStore.setSlackSettings(projectCode, projectName)
  })

  // timer signals
  handle('timer:started', () => {
    onTimerStarted(settingsStore)
    pomodoro.onTimerStarted(settingsStore)
  })
  handle('timer:stopped', () => {
    onTimerStopped()
    pomodoro.onTimerStopped()
  })
  handle('timer:adjustStartTime', (_, newStartMs) => {
    onTimerAdjustStartTime(newStartMs, settingsStore)
    pomodoro.onTimerAdjustStartTime(newStartMs, settingsStore)
  })

  // attendance
  handle('attendance:send', (_, text) => sendAttendance(settingsStore, authStore, text))
  handle('whiteboard:teleworkStart', async () => {
    // ホワイトボード失敗時も Slack 通知は実行する（旧実装と同じ挙動）
    await sendWhiteboardTeleworkStart(settingsStore, authStore).catch(err => logger.error('Whiteboard telework start failed:', err))
    await sendSlackTeleworkStart(settingsStore, authStore).catch(err => logger.error('Slack telework start failed:', err))
  })

  // setup
  handle('setup:complete', async () => {
    await settingsStore.completeSetup()
    const setupWin = getSetupWindow()
    if (setupWin && !setupWin.isDestroyed()) setupWin.close()
    app.dock?.hide()
    createTray(settingsStore)
    startIdleCheck(settingsStore)
  })

  // auth
  handle('auth:start', () => startSignIn())
  handle('auth:getStatus', () => authStore.getStatus())
  handle('auth:signOut', async () => {
    await authStore.clearToken()
    const status = await authStore.getStatus()
    broadcastAuthToAll(status)
  })

  // misc
  handle('holidays:get', () => getHolidays())
  handle('window:hide', () => hidePopover())
  handle('window:resize', (_, { width, height }) => resizePopover(width, height))
  handle('shell:openUrl', (_, url) => {
    // http(s) のみ許可する。file:// 等の他スキームを外部に開かせない。
    let protocol: string
    try {
      protocol = new URL(url).protocol
    } catch {
      logger.warn('blocked openExternal for invalid url:', url)
      return
    }
    if (protocol === 'http:' || protocol === 'https:') {
      shell.openExternal(url)
    } else {
      logger.warn('blocked openExternal for non-http(s) url:', url)
    }
  })
}
