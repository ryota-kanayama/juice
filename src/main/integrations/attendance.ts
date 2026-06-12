import { httpPost } from '../http'
import { logger } from '../logger'
import type { SettingsStore } from '../settingsStore'
import type { AuthStore } from '../auth/authStore'
import type { AttendanceSendResult } from '../../shared/ipc'
import { sendWhiteboardLeave } from './whiteboard'
import { sendSlackTeleworkEnd } from './slack'

/**
 * Lambda 経由で勤怠を送信する。user_name は Lambda が JWT から解決する。
 * 成功時はホワイトボード退勤 + Slack 終了通知も発火（非同期）。
 */
export async function sendAttendance(
  settingsStore: SettingsStore,
  authStore: AuthStore,
  text: string
): Promise<AttendanceSendResult> {
  const token = await authStore.getToken()
  if (!token) {
    return { ok: false, status: 0, body: 'Slack サインインが必要です（設定 > アカウント）' }
  }
  const result = await httpPost(
    `${import.meta.env.MAIN_VITE_PROXY_URL}/api/attendance.send`,
    JSON.stringify({ text }),
    { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  )
  if (result.ok) {
    sendWhiteboardLeave(settingsStore, authStore).catch(err => logger.error('Whiteboard leave failed:', err))
    sendSlackTeleworkEnd(settingsStore, authStore).catch(err => logger.error('Slack telework end failed:', err))
  }
  return result
}
