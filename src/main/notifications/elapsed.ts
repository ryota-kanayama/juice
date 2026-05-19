import { Notification } from 'electron'
import { showPopoverFromNotification } from '../windows/popover'
import { recordActivity } from './activity'
import type { SettingsStore } from '../settingsStore'

// 経過時間通知の state はこのモジュールに閉じ込める。
let timerStartTime: Date | null = null
let elapsedCheckInterval: ReturnType<typeof setInterval> | null = null
let elapsedNotifyCount: number = 0

/** タイマーが現在稼働中か（idle check が判定に使う） */
export function isTimerRunning(): boolean {
  return timerStartTime !== null
}

function clearLoop(): void {
  if (elapsedCheckInterval) {
    clearInterval(elapsedCheckInterval)
    elapsedCheckInterval = null
  }
}

function scheduleLoop(settingsStore: SettingsStore): void {
  clearLoop()
  if (!timerStartTime) return

  elapsedCheckInterval = setInterval(async () => {
    const settings = await settingsStore.getElapsedSettings()
    if (!settings.enabled || !timerStartTime) return

    const intervalMs = settings.minutes * 60 * 1000
    const nextNotifyAt = timerStartTime.getTime() + intervalMs * (elapsedNotifyCount + 1)

    if (Date.now() >= nextNotifyAt) {
      const totalMinutes = settings.minutes * (elapsedNotifyCount + 1)
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'Juice',
          body: `作業中 — ${totalMinutes}分経過しました`,
        })
        notif.on('click', () => showPopoverFromNotification(settingsStore))
        notif.show()
      }
      elapsedNotifyCount++
    }
  }, 60 * 1000)
}

export function onTimerStarted(settingsStore: SettingsStore): void {
  timerStartTime = new Date()
  elapsedNotifyCount = 0
  recordActivity()
  scheduleLoop(settingsStore)
}

export function onTimerStopped(): void {
  timerStartTime = null
  elapsedNotifyCount = 0
  clearLoop()
}

export function onTimerAdjustStartTime(newStartMs: number, settingsStore: SettingsStore): void {
  if (!timerStartTime) return
  timerStartTime = new Date(newStartMs)
  // 新しい開始時刻に合わせて通知済みカウントをリセットして再スケジュール
  elapsedNotifyCount = 0
  scheduleLoop(settingsStore)
}

/** 通知設定変更時の再スケジュール（タイマー稼働中のみ反映） */
export function reschedule(settingsStore: SettingsStore): void {
  if (timerStartTime) scheduleLoop(settingsStore)
}
