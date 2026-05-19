import { httpPost } from '../http'
import type { SettingsStore } from '../settingsStore'

/** Slack のチャンネルにメッセージを投稿する。トークン / チャンネル未設定なら何もしない。 */
async function sendSlackMessage(text: string): Promise<void> {
  const token = import.meta.env.MAIN_VITE_SLACK_BOT_TOKEN
  const channel = import.meta.env.MAIN_VITE_SLACK_CHANNEL_ID
  if (!token || !channel) return

  const result = await httpPost(
    'https://slack.com/api/chat.postMessage',
    JSON.stringify({ channel, text }),
    {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    }
  )
  if (!result.ok) {
    throw new Error(`Slack API error: ${result.status} ${result.body}`)
  }
}

export async function sendSlackTeleworkStart(settingsStore: SettingsStore): Promise<void> {
  const { projectCode, projectName } = await settingsStore.getSlackSettings()
  await sendSlackMessage(`テレワークを開始します\n${projectCode} ${projectName}`)
}

export async function sendSlackTeleworkEnd(settingsStore: SettingsStore): Promise<void> {
  const { projectCode, projectName } = await settingsStore.getSlackSettings()
  await sendSlackMessage(`テレワークを終了します\n${projectCode} ${projectName}`)
}
