// アクティビティ追跡: 「最後にユーザーが操作した時刻」と「アイドル通知済みフラグ」を保持する。
// idle.ts と elapsed.ts の両方が更新するため、循環を避けるためにここに切り出している。

let lastActivityTime: Date = new Date()
let idleNotificationSent: boolean = false

export function recordActivity(): void {
  lastActivityTime = new Date()
  idleNotificationSent = false
}

export function getLastActivityTime(): Date {
  return lastActivityTime
}

export function wasIdleNotificationSent(): boolean {
  return idleNotificationSent
}

export function markIdleNotificationSent(): void {
  idleNotificationSent = true
}
