import { Notification } from 'electron'
import { showPopoverFromNotification } from '../windows/popover'
import { isTimerRunning } from './elapsed'
import {
  getLastActivityTime,
  markIdleNotificationSent,
  wasIdleNotificationSent,
} from './activity'
import type { SettingsStore } from '../settingsStore'

// アイドル検知の interval 管理だけをここに持つ。
// lastActivityTime と idleNotificationSent は activity.ts に集約済み。
let idleCheckInterval: ReturnType<typeof setInterval> | null = null

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

    const idleMs = Date.now() - getLastActivityTime().getTime()
    const thresholdMs = settings.minutes * 60 * 1000

    if (idleMs >= thresholdMs && !wasIdleNotificationSent() && !isTimerRunning()) {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'Juice',
          body: 'ジュースを飲みたくありませんか？',
        })
        notif.on('click', () => showPopoverFromNotification(settingsStore))
        notif.show()
        markIdleNotificationSent()
      }
    }
  }, 60 * 1000)
}
