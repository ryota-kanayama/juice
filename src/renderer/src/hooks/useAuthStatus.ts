import { useEffect, useState } from 'react'
import type { AuthStatus } from '../../../shared/ipc'

/** サインイン状態の取得・購読と、サインイン/アウト操作 */
export function useAuthStatus() {
  const [status, setStatus] = useState<AuthStatus>({ signedIn: false })

  useEffect(() => {
    window.electronAPI.getAuthStatus().then(setStatus)
    window.electronAPI.onAuthChanged(setStatus)
  }, [])

  return {
    status,
    signIn: (): void => { window.electronAPI.signInWithSlack() },
    signOut: (): void => { window.electronAPI.signOutSlack() },
  }
}
