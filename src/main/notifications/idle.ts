import { Notification } from 'electron'
import { showPopoverFromNotification } from '../windows/popover'
import { isTimerRunning } from './elapsed'
import type { SettingsStore } from '../settingsStore'

// アイドル検知の state はこのモジュールに閉じ込める。
let lastActivityTime: Date = new Date()
let idleNotificationSent: boolean = false
let idleCheckInterval: ReturnType<typeof setInterval> | null = null

/** セッション操作などのアクティビティがあったことを記録する */
export function recordActivity(): void {
  lastActivityTime = new Date()
  idleNotificationSent = false
}

/**
 * アイドル検知を開始する。設定が無効化されていれば既存 interval を停止して何もしない。
 * 設定変更時に呼び直すと再スケジュールされる。
 */
export async function startIdleCheck(settingsStore: SettingsStore): Promise<void> {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval)
    idleCheckInterval = null
  }

  const { enabled } = await settingsStore.getIdleSettings()
  if (!enabled) return

  idleCheckInterval = setInterval(async () => {
    const settings = await settingsStore.getIdleSettings()
    if (!settings.enabled) return

    const idleMs = Date.now() - lastActivityTime.getTime()
    const thresholdMs = settings.minutes * 60 * 1000

    if (idleMs >= thresholdMs && !idleNotificationSent && !isTimerRunning()) {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'Juice',
          body: 'ジュースを飲みたくありませんか？',
        })
        notif.on('click', () => showPopoverFromNotification(settingsStore))
        notif.show()
        idleNotificationSent = true
      }
    }
  }, 60 * 1000)
}
