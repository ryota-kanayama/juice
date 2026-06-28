import { httpPost } from '../http'
import { broadcastAuthToAll } from '../windows/authBroadcast'
import { logger } from '../logger'
import type { AuthStore } from './authStore'

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/** 有効なセッショントークンを黙って再発行して保存する。失敗時は既存トークンを維持。 */
export async function refreshSession(authStore: AuthStore): Promise<void> {
  const token = await authStore.getToken()
  if (!token) return
  const result = await httpPost(
    `${import.meta.env.MAIN_VITE_PROXY_URL}/auth/refresh`,
    '',
    { Authorization: `Bearer ${token}` }
  )
  if (!result.ok) return
  try {
    const parsed = JSON.parse(result.body) as { token?: unknown }
    if (typeof parsed.token === 'string') {
      await authStore.saveToken(parsed.token)
      broadcastAuthToAll(await authStore.getStatus())
    }
  } catch (err) {
    logger.error('session refresh parse failed:', err)
  }
}

/** 起動時に一度更新し、以降 24 時間ごとに更新する */
export function startSessionRefresh(authStore: AuthStore): void {
  void refreshSession(authStore)
  setInterval(() => void refreshSession(authStore), REFRESH_INTERVAL_MS)
}
