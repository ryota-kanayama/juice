import { httpPost } from '../http'
import type { SettingsStore } from '../settingsStore'
import type { AuthStore } from '../auth/authStore'
import { promptSignIn } from '../auth/promptSignIn'

type TeleworkKind = 'telework_start' | 'telework_end'

/**
 * Lambda 経由でテレワーク通知を投稿する。
 * 未サインイン・セッション切れの場合は通知して何もしない（throw しない）。
 */
async function postTelework(
  kind: TeleworkKind,
  settingsStore: SettingsStore,
  authStore: AuthStore
): Promise<void> {
  const token = await authStore.getToken()
  if (!token) {
    promptSignIn()
    return
  }
  const { projectCode, projectName } = await settingsStore.getSlackSettings()
  const result = await httpPost(
    `${import.meta.env.MAIN_VITE_PROXY_URL}/api/slack.post`,
    JSON.stringify({ kind, projectCode, projectName }),
    { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  )
  if (result.status === 401) {
    promptSignIn()
    return
  }
  if (!result.ok) {
    throw new Error(`Slack proxy error: ${result.status} ${result.body}`)
  }
}

export function sendSlackTeleworkStart(
  settingsStore: SettingsStore,
  authStore: AuthStore
): Promise<void> {
  return postTelework('telework_start', settingsStore, authStore)
}

export function sendSlackTeleworkEnd(
  settingsStore: SettingsStore,
  authStore: AuthStore
): Promise<void> {
  return postTelework('telework_end', settingsStore, authStore)
}
