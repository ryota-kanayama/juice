import { app } from 'electron'
import type { SessionStore } from '../sessionStore'
import type { SettingsStore } from '../settingsStore'
import { logger } from '../logger'
import { handle } from './handle'
import { hidePopover, resizePopover } from '../windows/popover'
import { getSetupWindow } from '../windows/setup'
import { createTray } from '../windows/tray'
import { broadcastThemeToAll } from '../windows/themeBroadcast'
import { startIdleCheck } from '../notifications/idle'
import { recordActivity } from '../notifications/activity'
import { onTimerStarted, onTimerStopped, onTimerAdjustStartTime, reschedule } from '../notifications/elapsed'
import { sendAttendance } from '../integrations/attendance'
import { sendSlackTeleworkStart } from '../integrations/slack'
import { sendWhiteboardTeleworkStart } from '../integrations/whiteboard'
import { getHolidays } from '../integrations/holidays'
import { shell } from 'electron'

/** すべての IPC ハンドラを登録する */
export function registerIpcHandlers(
  sessionStore: SessionStore,
  settingsStore: SettingsStore,
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

  // settings: userName / integrations
  handle('settings:getUserName', () => settingsStore.getUserName())
  handle('settings:setUserName', async (_, userName) => {
    await settingsStore.setUserName(userName)
  })
  handle('settings:getWhiteboardSettings', () => settingsStore.getWhiteboardSettings())
  handle('settings:setWhiteboardSettings', async (_, { enabled, email }) => {
    await settingsStore.setWhiteboardSettings(enabled, email)
  })
  handle('settings:getSlackSettings', () => settingsStore.getSlackSettings())
  handle('settings:setSlackSettings', async (_, { projectCode, projectName }) => {
    await settingsStore.setSlackSettings(projectCode, projectName)
  })

  // timer signals
  handle('timer:started', () => onTimerStarted(settingsStore))
  handle('timer:stopped', () => onTimerStopped())
  handle('timer:adjustStartTime', (_, newStartMs) => onTimerAdjustStartTime(newStartMs, settingsStore))

  // attendance
  handle('attendance:send', (_, text) => sendAttendance(settingsStore, text))
  handle('whiteboard:teleworkStart', async () => {
    await sendWhiteboardTeleworkStart(settingsStore)
    await sendSlackTeleworkStart(settingsStore).catch(err => logger.error('Slack telework start failed:', err))
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

  // misc
  handle('holidays:get', () => getHolidays())
  handle('window:hide', () => hidePopover())
  handle('window:resize', (_, { width, height }) => resizePopover(width, height))
  handle('shell:openUrl', (_, url) => { shell.openExternal(url) })
}
