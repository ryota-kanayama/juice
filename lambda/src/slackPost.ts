export type TeleworkKind = 'telework_start' | 'telework_end'

export interface SlackPostRequest {
  kind: TeleworkKind
  projectCode: string
  projectName: string
}

const MAX_FIELD_LENGTH = 100

const MESSAGES: Record<TeleworkKind, string> = {
  telework_start: 'テレワークを開始します',
  telework_end: 'テレワークを終了します',
}

/** リクエストボディを検証してパースする。不正は null */
export function parseSlackPostRequest(body: string): SlackPostRequest | null {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { kind, projectCode, projectName } = data as Record<string, unknown>
  if (kind !== 'telework_start' && kind !== 'telework_end') return null
  if (typeof projectCode !== 'string' || projectCode.length > MAX_FIELD_LENGTH) return null
  if (typeof projectName !== 'string' || projectName.length > MAX_FIELD_LENGTH) return null
  return { kind, projectCode, projectName }
}

/** 投稿文面を固定テンプレートで組み立てる（自由テキストは受け付けない） */
export function buildTeleworkMessage(req: SlackPostRequest): string {
  return `${MESSAGES[req.kind]}\n${req.projectCode} ${req.projectName}`
}

/** chat.postMessage で固定チャンネルに投稿する。失敗は {error}（throw しない） */
export async function postToSlack(
  text: string,
  opts: { botToken: string; channelId: string }
): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${opts.botToken}`,
      },
      body: JSON.stringify({ channel: opts.channelId, text }),
    })
    const result = (await res.json()) as { ok: boolean; error?: string }
    if (!result.ok) return { error: result.error ?? 'unknown' }
    return { ok: true }
  } catch (e) {
    return { error: `network: ${e instanceof Error ? e.message : 'unknown'}` }
  }
}
