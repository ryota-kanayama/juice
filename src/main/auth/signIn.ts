import { randomBytes } from 'crypto'
import { Notification, shell } from 'electron'
import { logger } from '../logger'
import type { AuthStore } from './authStore'
import { broadcastAuthToAll } from '../windows/authBroadcast'

const STATE_TTL_MS = 10 * 60 * 1000

let pendingState: { state: string; expiresAt: number } | null = null

/**
 * ブラウザで Slack サインインを開始する。
 * 再度呼ぶと前回の state は無効になる（最後に開いたタブでのみ完了できる）。
 */
export function startSignIn(): void {
  const state = randomBytes(16).toString('hex')
  pendingState = { state, expiresAt: Date.now() + STATE_TTL_MS }
  shell.openExternal(`${import.meta.env.MAIN_VITE_PROXY_URL}/auth/start?state=${state}`)
}

/**
 * juice://auth?token&state コールバックを処理する。
 * state の照合に成功した場合のみトークンを保存し、true を返す。
 */
export async function handleAuthCallback(rawUrl: string, authStore: AuthStore): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'juice:' || url.host !== 'auth') return false

  const token = url.searchParams.get('token')
  const state = url.searchParams.get('state')
  const pending = pendingState
  pendingState = null // ワンショット: 成否によらず使い捨てる

  // サインイン進行中でなければ静かに無視する（無関係・悪意あるコールバック対策）
  if (!pending) return false

  if (pending.state !== state || Date.now() > pending.expiresAt || !token) {
    logger.error('auth callback rejected: state mismatch or expired')
    new Notification({ title: 'Juice', body: 'サインインに失敗しました。やり直してください。' }).show()
    return false
  }

  await authStore.saveToken(token)
  const status = await authStore.getStatus()
  broadcastAuthToAll(status)
  new Notification({ title: 'Juice', body: `Slack にサインインしました（${status.name ?? ''}）` }).show()
  return true
}

/** テスト用: pending state をリセット */
export function _resetForTest(): void {
  pendingState = null
}
