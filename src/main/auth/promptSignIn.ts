import { Notification } from 'electron'

// サインイン促し通知はアプリ起動ごとに1回だけ
let prompted = false

/** Slack サインインを促す OS 通知を表示する（起動ごとに1回だけ） */
export function promptSignIn(): void {
  if (prompted) return
  prompted = true
  new Notification({
    title: 'Juice',
    body: '連携機能には Slack サインインが必要です。設定 > アカウントからサインインしてください。',
  }).show()
}

/** テスト用: 通知済みフラグをリセット */
export function _resetForTest(): void {
  prompted = false
}
