import { httpPost } from '../http'
import { logger } from '../logger'
import type { SettingsStore } from '../settingsStore'

// magnet_id: ホワイトボード上の状態を示す値
const MAGNET_LEAVE = 3
const MAGNET_TELEWORK = 2

/** ホワイトボードを「退勤」状態にし、勤怠 API にも come_to_the_office=false を送る */
export async function sendWhiteboardLeave(settingsStore: SettingsStore): Promise<void> {
  const { enabled, email } = await settingsStore.getWhiteboardSettings()
  if (!enabled || !email) return

  const apiUrl = import.meta.env.MAIN_VITE_WHITEBOARD_API_URL
  const apiKey = import.meta.env.MAIN_VITE_WHITEBOARD_API_KEY
  if (!apiUrl || !apiKey) return

  const magnet = await httpPost(
    `${apiUrl}/api/magnet?apiKey=${apiKey}`,
    JSON.stringify({ magnet_id: MAGNET_LEAVE, email }),
    { 'Content-Type': 'application/json' }
  )
  if (!magnet.ok) {
    logger.error('Whiteboard magnet API failed:', magnet.status, magnet.body)
    return
  }

  const attendance = await httpPost(
    `${apiUrl}/api/attendance?apiKey=${apiKey}`,
    `come_to_the_office=false&email=${encodeURIComponent(email)}`,
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  )
  if (!attendance.ok) {
    logger.error('Whiteboard attendance API failed:', attendance.status, attendance.body)
  }
}

/** ホワイトボードを「テレワーク」状態にし、勤怠 API にも come_to_the_office=true を送る */
export async function sendWhiteboardTeleworkStart(settingsStore: SettingsStore): Promise<void> {
  const { enabled, email } = await settingsStore.getWhiteboardSettings()
  if (!enabled || !email) return

  const apiUrl = import.meta.env.MAIN_VITE_WHITEBOARD_API_URL
  const apiKey = import.meta.env.MAIN_VITE_WHITEBOARD_API_KEY
  if (!apiUrl || !apiKey) return

  const magnet = await httpPost(
    `${apiUrl}/api/magnet?apiKey=${apiKey}`,
    JSON.stringify({ magnet_id: MAGNET_TELEWORK, email }),
    { 'Content-Type': 'application/json' }
  )
  if (!magnet.ok) {
    logger.error('Whiteboard telework magnet API failed:', magnet.status, magnet.body)
    return
  }

  const attendance = await httpPost(
    `${apiUrl}/api/attendance?apiKey=${apiKey}`,
    `come_to_the_office=true&email=${encodeURIComponent(email)}`,
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  )
  if (!attendance.ok) {
    logger.error('Whiteboard telework attendance API failed:', attendance.status, attendance.body)
  }
}
