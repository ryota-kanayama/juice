import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionStore } from '../sessionStore'
import type { SettingsStore } from '../settingsStore'
import type { AuthStore } from '../auth/authStore'
import type { DailyStore } from '../dailyStore'

// すべての外部依存をモック化し、handle() で登録されたハンドラを捕捉する。
const m = vi.hoisted(() => ({
  handlers: new Map<string, (...a: unknown[]) => unknown>(),
  shellOpenExternal: vi.fn(),
  dockHide: vi.fn(),
  getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
  setLoginItemSettings: vi.fn(),
  recordActivity: vi.fn(),
  onTimerStarted: vi.fn(),
  onTimerStopped: vi.fn(),
  onTimerAdjustStartTime: vi.fn(),
  reschedule: vi.fn(),
  pomoStarted: vi.fn(),
  pomoStopped: vi.fn(),
  pomoAdjust: vi.fn(),
  pomoReschedule: vi.fn(),
  startIdleCheck: vi.fn(),
  sendAttendance: vi.fn(() => Promise.resolve({ ok: true })),
  sendWhiteboardTeleworkStart: vi.fn(() => Promise.resolve()),
  getHolidays: vi.fn(() => ({})),
  broadcastThemeToAll: vi.fn(),
  broadcastAuthToAll: vi.fn(),
  hidePopover: vi.fn(),
  resizePopover: vi.fn(),
  getSetupWindow: vi.fn(() => null),
  createTray: vi.fn(),
  startSignIn: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('./handle', () => ({
  handle: (channel: string, fn: (...a: unknown[]) => unknown) => {
    m.handlers.set(channel, fn)
  },
}))
vi.mock('electron', () => ({
  app: {
    dock: { hide: m.dockHide },
    getLoginItemSettings: m.getLoginItemSettings,
    setLoginItemSettings: m.setLoginItemSettings,
  },
  shell: { openExternal: m.shellOpenExternal },
}))
vi.mock('../notifications/activity', () => ({ recordActivity: m.recordActivity }))
vi.mock('../notifications/elapsed', () => ({
  onTimerStarted: m.onTimerStarted,
  onTimerStopped: m.onTimerStopped,
  onTimerAdjustStartTime: m.onTimerAdjustStartTime,
  reschedule: m.reschedule,
}))
vi.mock('../notifications/pomodoro', () => ({
  onTimerStarted: m.pomoStarted,
  onTimerStopped: m.pomoStopped,
  onTimerAdjustStartTime: m.pomoAdjust,
  reschedule: m.pomoReschedule,
}))
vi.mock('../notifications/idle', () => ({ startIdleCheck: m.startIdleCheck }))
vi.mock('../integrations/attendance', () => ({ sendAttendance: m.sendAttendance }))
vi.mock('../integrations/whiteboard', () => ({ sendWhiteboardTeleworkStart: m.sendWhiteboardTeleworkStart }))
vi.mock('../integrations/holidays', () => ({ getHolidays: m.getHolidays }))
vi.mock('../windows/themeBroadcast', () => ({ broadcastThemeToAll: m.broadcastThemeToAll }))
vi.mock('../windows/authBroadcast', () => ({ broadcastAuthToAll: m.broadcastAuthToAll }))
vi.mock('../windows/popover', () => ({ hidePopover: m.hidePopover, resizePopover: m.resizePopover }))
vi.mock('../windows/setup', () => ({ getSetupWindow: m.getSetupWindow }))
vi.mock('../windows/tray', () => ({ createTray: m.createTray }))
vi.mock('../auth/signIn', () => ({ startSignIn: m.startSignIn }))
vi.mock('../logger', () => ({ logger: { warn: m.loggerWarn, error: m.loggerError, info: vi.fn() } }))

import { registerIpcHandlers } from './registerHandlers'

const STORE_METHODS = {
  session: ['getSessions', 'saveSession', 'updateSession', 'deleteSession'],
  settings: [
    'getTheme', 'setTheme', 'getIdleSettings', 'setIdleSettings', 'getElapsedSettings',
    'setElapsedSettings', 'getPomodoroSettings', 'setPomodoroSettings', 'getWhiteboardSettings',
    'setWhiteboardSettings', 'getBreakBehaviorSettings', 'setBreakBehaviorSettings',
    'getMainProjectCode', 'setMainProjectCode', 'completeSetup',
  ],
  auth: ['getStatus', 'clearToken'],
  daily: ['getMonth', 'setDay', 'prune', 'importLegacy'],
}

function stub(names: string[]): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(names.map(n => [n, vi.fn(async () => undefined)]))
}

let sessionStore: SessionStore
let settingsStore: SettingsStore
let authStore: AuthStore
let dailyStore: DailyStore

function invoke(channel: string, arg?: unknown): unknown {
  const fn = m.handlers.get(channel)
  if (!fn) throw new Error(`handler not registered: ${channel}`)
  return fn({}, arg)
}

beforeEach(() => {
  vi.clearAllMocks()
  m.handlers.clear()
  sessionStore = stub(STORE_METHODS.session) as unknown as SessionStore
  settingsStore = stub(STORE_METHODS.settings) as unknown as SettingsStore
  authStore = stub(STORE_METHODS.auth) as unknown as AuthStore
  dailyStore = stub(STORE_METHODS.daily) as unknown as DailyStore
  registerIpcHandlers(sessionStore, settingsStore, authStore, dailyStore)
})

describe('registerIpcHandlers', () => {
  it('主要なチャンネルを登録する', () => {
    for (const ch of ['sessions:get', 'daily:getMonth', 'settings:setTheme', 'timer:started', 'attendance:send', 'shell:openUrl']) {
      expect(m.handlers.has(ch)).toBe(true)
    }
  })

  it('sessions:save はストアへ保存し操作を記録する', async () => {
    const session = { id: '1' }
    await invoke('sessions:save', session)
    expect(sessionStore.saveSession).toHaveBeenCalledWith(session)
    expect(m.recordActivity).toHaveBeenCalled()
  })

  it('timer:started は elapsed と pomodoro 両方を起動する', () => {
    invoke('timer:started')
    expect(m.onTimerStarted).toHaveBeenCalledWith(settingsStore)
    expect(m.pomoStarted).toHaveBeenCalledWith(settingsStore)
  })

  it('settings:setTheme は保存しテーマを全ウィンドウへ配信する', async () => {
    await invoke('settings:setTheme', 'rose')
    expect(settingsStore.setTheme).toHaveBeenCalledWith('rose')
    expect(m.broadcastThemeToAll).toHaveBeenCalledWith('rose')
  })

  it('settings:setIdleSettings は保存後に操作記録とアイドル再開を行う', async () => {
    await invoke('settings:setIdleSettings', { enabled: true, minutes: 30 })
    expect(settingsStore.setIdleSettings).toHaveBeenCalledWith(true, 30)
    expect(m.recordActivity).toHaveBeenCalled()
    expect(m.startIdleCheck).toHaveBeenCalledWith(settingsStore)
  })

  it('attendance:send はストアとテキストを渡して送信する', () => {
    invoke('attendance:send', '勤怠テキスト')
    expect(m.sendAttendance).toHaveBeenCalledWith(settingsStore, authStore, '勤怠テキスト')
  })

  it('whiteboard:teleworkStart はテレワーク開始を送信する', async () => {
    await invoke('whiteboard:teleworkStart')
    expect(m.sendWhiteboardTeleworkStart).toHaveBeenCalledWith(settingsStore, authStore)
  })

  it('window:resize はポップオーバーをリサイズする', () => {
    invoke('window:resize', { width: 560, height: 420 })
    expect(m.resizePopover).toHaveBeenCalledWith(560, 420)
  })

  it('shell:openUrl は http(s) のみ外部に開く', () => {
    invoke('shell:openUrl', 'https://example.com')
    expect(m.shellOpenExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('shell:openUrl は非 http(s) スキームをブロックする', () => {
    invoke('shell:openUrl', 'file:///etc/passwd')
    expect(m.shellOpenExternal).not.toHaveBeenCalled()
  })

  it('shell:openUrl は不正な URL をブロックする', () => {
    invoke('shell:openUrl', 'not a url')
    expect(m.shellOpenExternal).not.toHaveBeenCalled()
  })

  it('setup:complete は完了保存しトレイを作る', async () => {
    await invoke('setup:complete')
    expect(settingsStore.completeSetup).toHaveBeenCalled()
    expect(m.createTray).toHaveBeenCalledWith(settingsStore)
  })

  it('auth:signOut はトークンを消し状態を配信する', async () => {
    await invoke('auth:signOut')
    expect(authStore.clearToken).toHaveBeenCalled()
    expect(m.broadcastAuthToAll).toHaveBeenCalled()
  })

  it('settings:getLaunchAtLogin は OS のログイン項目状態を返す', async () => {
    m.getLoginItemSettings.mockReturnValue({ openAtLogin: true })
    expect(await invoke('settings:getLaunchAtLogin')).toBe(true)
  })

  it('settings:setLaunchAtLogin は OS のログイン項目を設定する', async () => {
    await invoke('settings:setLaunchAtLogin', true)
    expect(m.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  })
})
