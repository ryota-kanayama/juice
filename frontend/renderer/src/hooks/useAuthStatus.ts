import { useEffect, useState } from 'react'
import type { AuthStatus } from '../../../shared/ipc'

/** サインイン状態の取得・購読と、サインイン/アウト操作 */
export function useAuthStatus() {
  const [status, setStatus] = useState<AuthStatus>({ signedIn: false })

  useEffect(() => {
    let alive = true
    window.bridge.getAuthStatus().then((s) => { if (alive) setStatus(s) })
    const off = window.bridge.onAuthChanged(setStatus)
    return () => { alive = false; off() }
  }, [])

  return {
    status,
    signIn: (): void => { window.bridge.signInWithSlack() },
    signOut: (): void => { window.bridge.signOutSlack().catch(console.error) },
  }
}
