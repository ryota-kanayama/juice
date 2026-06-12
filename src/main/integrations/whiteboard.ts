import { httpPost } from '../http'
import { promptSignIn } from '../auth/promptSignIn'
import type { SettingsStore } from '../settingsStore'
import type { AuthStore } from '../auth/authStore'

type WhiteboardKind = 'telework' | 'leave'

/**
 * Lambda 経由でホワイトボードの状態を更新する。email は Lambda が JWT から解決する。
 * 連携無効なら何もしない。未サインイン・セッション切れは通知してスキップ（throw しない）。
 */
async function postWhiteboard(
  kind: WhiteboardKind,
  settingsStore: SettingsStore,
  authStore: AuthStore
): Promise<void> {
  const { enabled } = await settingsStore.getWhiteboardSettings()
  if (!enabled) return
  const token = await authStore.getToken()
  if (!token) {
    promptSignIn()
    return
  }
  const result = await httpPost(
    `${import.meta.env.MAIN_VITE_PROXY_URL}/api/whiteboard.${kind}`,
    '{}',
    { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  )
  if (result.status === 401) {
    // 未認証 or email クレーム無し（reauth_required）。再サインインを促す
    promptSignIn()
    return
  }
  if (!result.ok) {
    throw new Error(`Whiteboard proxy error: ${result.status} ${result.body}`)
  }
}

/** ホワイトボードを「テレワーク」状態にし、勤怠 API にも出勤を送る */
export function sendWhiteboardTeleworkStart(
  settingsStore: SettingsStore,
  authStore: AuthStore
): Promise<void> {
  return postWhiteboard('telework', settingsStore, authStore)
}

/** ホワイトボードを「退勤」状態にし、勤怠 API にも退勤を送る */
export function sendWhiteboardLeave(
  settingsStore: SettingsStore,
  authStore: AuthStore
): Promise<void> {
  return postWhiteboard('leave', settingsStore, authStore)
}
