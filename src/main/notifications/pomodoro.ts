import { Notification } from 'electron'
import { showPopoverFromNotification } from '../windows/popover'
import type { SettingsStore } from '../settingsStore'

// ポモドーロ通知の state はこのモジュールに閉じ込める。
// サイクル: 作業25分 → 休憩5分 の30分周期（固定）。
const WORK_MS = 25 * 60 * 1000
const CYCLE_MS = 30 * 60 * 1000

const BREAK_MESSAGE = '25分経ちました。5分休憩してください'
const RESUME_MESSAGE = '休憩終了です。作業を再開しましょう'

let cycleStartTime: Date | null = null
let boundaryTimeout: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (boundaryTimeout) {
    clearTimeout(boundaryTimeout)
    boundaryTimeout = null
  }
}

/** 次のフェーズ境界（起点から 25分 / 30分 / 55分 / 60分 …）に setTimeout を予約する */
function scheduleNext(settingsStore: SettingsStore): void {
  clearTimer()
  if (!cycleStartTime) return

  const pos = (Date.now() - cycleStartTime.getTime()) % CYCLE_MS
  const delay = pos < WORK_MS ? WORK_MS - pos : CYCLE_MS - pos

  boundaryTimeout = setTimeout(async () => {
    try {
      const settings = await settingsStore.getPomodoroSettings()
      if (cycleStartTime && settings.enabled && Notification.isSupported()) {
        // スリープ等で発火が遅れるケースに備え、フェーズは発火時点の経過時間から判定する
        const firedPos = (Date.now() - cycleStartTime.getTime()) % CYCLE_MS
        const notif = new Notification({
          title: 'Juice',
          body: firedPos >= WORK_MS ? BREAK_MESSAGE : RESUME_MESSAGE,
        })
        notif.on('click', () => showPopoverFromNotification(settingsStore))
        notif.show()
      }
    } catch {
      // 設定読み込み失敗時は通知をスキップして次サイクルを継続
    } finally {
      scheduleNext(settingsStore)
    }
  }, delay)
}

export function onTimerStarted(settingsStore: SettingsStore): void {
  cycleStartTime = new Date()
  scheduleNext(settingsStore)
}

export function onTimerStopped(): void {
  cycleStartTime = null
  clearTimer()
}

export function onTimerAdjustStartTime(newStartMs: number, settingsStore: SettingsStore): void {
  if (!cycleStartTime) return
  cycleStartTime = new Date(newStartMs)
  scheduleNext(settingsStore)
}

/** 設定変更時の再スケジュール（タイマー稼働中のみ反映） */
export function reschedule(settingsStore: SettingsStore): void {
  if (cycleStartTime) scheduleNext(settingsStore)
}
