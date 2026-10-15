/**
 * メッセージ中の API キー（URL に載るエンコード済み・生の両方）を伏せる。
 * fetch の失敗メッセージには URL（キーを含む）が入りうるため、呼び出し側がログに出す前に通す。
 * 生のキーがエンコード済みの一部になりうるので、長いエンコード済みを先に置換する。
 */
export function redactKey(message: string, apiKey: string): string {
  if (!apiKey) return message
  return message.replaceAll(encodeURIComponent(apiKey), '***').replaceAll(apiKey, '***')
}
