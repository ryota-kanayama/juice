import { httpPost } from '../http'
import { logger } from '../logger'
import type { SettingsStore } from '../settingsStore'
import type { AttendanceSendResult } from '../../shared/ipc'
import { sendWhiteboardLeave } from './whiteboard'
import { sendSlackTeleworkEnd } from './slack'

/**
 * 勤怠 API にテキストを送信する。成功時はホワイトボード退勤 + Slack 終了通知も発火（非同期）。
 */
export async function sendAttendance(
  settingsStore: SettingsStore,
  text: string
): Promise<AttendanceSendResult> {
  const userName = await settingsStore.getUserName()
  if (!userName) {
    return { ok: false, status: 0, body: 'user_name が設定されていません' }
  }
  const formBody = `user_name=${encodeURIComponent(userName)}&text=${encodeURIComponent(text)}`
  const result = await httpPost(
    `${import.meta.env.MAIN_VITE_ATTENDANCE_API_URL}?key=${import.meta.env.MAIN_VITE_ATTENDANCE_API_KEY}`,
    formBody,
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  )
  if (result.ok) {
    sendWhiteboardLeave(settingsStore).catch(err => logger.error('Whiteboard leave failed:', err))
    sendSlackTeleworkEnd(settingsStore).catch(err => logger.error('Slack telework end failed:', err))
  }
  return result
}
