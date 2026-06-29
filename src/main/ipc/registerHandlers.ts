import { app } from 'electron'
import type { SessionStore } from '../sessionStore'
import type { SettingsStore } from '../settingsStore'
import type { AuthStore } from '../auth/authStore'
import type { DailyStore } from '../dailyStore'
import type { UpdateService } from '../update/updateService'
import { startSignIn } from '../auth/signIn'
import { notifyRendererReady } from '../update/prepareQuit'
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
import { setTimerRunning, isTimerRunning } from '../timerActivity'
import { sendAttendance } from '../integrations/attendance'
import { sendWhiteboardTeleworkStart } from '../integrations/whiteboard'
import { getHolidays } from '../integrations/holidays'
import { shell } from 'electron'

/** すべての IPC ハンドラを登録する */
export function registerIpcHandlers(
  sessionStore: SessionStore,
  settingsStore: SettingsStore,
  authStore: AuthStore,
  dailyStore: DailyStore,
  updateService: UpdateService,
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

  // daily（日次勤務データ）
  handle('daily:getMonth', (_, yearMonth) => dailyStore.getMonth(yearMonth))
  handle('daily:setDay', (_, { date, patch }) => dailyStore.setDay(date, patch))
  handle('daily:prune', (_, { keepDays }) => dailyStore.prune(keepDays))
  handle('daily:importLegacy', (_, { entries }) => dailyStore.importLegacy(entries))

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
  handle('settings:getBreakBehaviorSettings', () => settingsStore.getBreakBehaviorSettings())
  handle('settings:setBreakBehaviorSettings', (_, { behavior }) => settingsStore.setBreakBehaviorSettings(behavior))

  // settings: analysis
  handle('settings:getMainProjectCode', () => settingsStore.getMainProjectCode())
  handle('settings:setMainProjectCode', (_, code) => settingsStore.setMainProjectCode(code))

  // startup（ログイン時に起動。OS のログイン項目が真実）
  handle('settings:getLaunchAtLogin', () => app.getLoginItemSettings().openAtLogin)
  handle('settings:setLaunchAtLogin', (_, enabled) =>
    app.setLoginItemSettings({ openAtLogin: enabled })
  )

  // timer signals
  handle('timer:started', () => {
    setTimerRunning(true)
    onTimerStarted(settingsStore)
    pomodoro.onTimerStarted(settingsStore)
  })
  handle('timer:stopped', () => {
    setTimerRunning(false)
    onTimerStopped()
    pomodoro.onTimerStopped()
  })
  handle('timer:isRunning', () => isTimerRunning())
  handle('timer:adjustStartTime', (_, newStartMs) => {
    onTimerAdjustStartTime(newStartMs, settingsStore)
    pomodoro.onTimerAdjustStartTime(newStartMs, settingsStore)
  })

  // attendance
  handle('attendance:send', (_, text) => sendAttendance(settingsStore, authStore, text))
  handle('whiteboard:teleworkStart', async () => {
    await sendWhiteboardTeleworkStart(settingsStore, authStore).catch(err => logger.error('Whiteboard telework start failed:', err))
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

  // update
  handle('update:check', () => updateService.checkForUpdate())
  handle('update:dismiss', (_, version) => updateService.dismiss(version))
  handle('update:install', () => updateService.install())
  handle('update:ready-to-quit', () => { notifyRendererReady() })

  // misc
  handle('app:getVersion', () => app.getVersion())
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
