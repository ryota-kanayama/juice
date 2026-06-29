import { broadcastToAll } from '../windows/updateBroadcast'

// ポップオーバーからの ack を待つためのペンディング関数
let pending: (() => void) | null = null

/**
 * ポップオーバーが保存完了を ack したときに呼ぶ（registerHandlers から）
 */
export function notifyRendererReady(): void {
  pending?.()
  pending = null
}

/**
 * 全ウィンドウへ update-prepare-quit を送り、ack かタイムアウトを待つ。
 * ack が無くても更新をハングさせないため timeoutMs で必ず解決する。
 */
export function prepareQuitForUpdate(
  send: () => void = () => broadcastToAll('update-prepare-quit', undefined),
  timeoutMs = 3000,
): Promise<void> {
  return new Promise<void>(resolve => {
    const finish = (): void => {
      clearTimeout(timer)
      pending = null
      resolve()
    }
    pending = finish
    const timer = setTimeout(finish, timeoutMs)
    send()
  })
}
