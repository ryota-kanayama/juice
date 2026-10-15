import { useEffect, useState } from 'react'
import { updateRepository } from '../repositories/updateRepository'
import { timerRepository } from '../repositories/timerRepository'
import type { UpdateInfo } from '../../../shared/types'

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'installing' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  info: UpdateInfo | null
  percent: number
  error: string | null
  currentVersion: string
  checking: boolean
  checkedUpToDate: boolean
  check: () => Promise<void>
  install: () => void
  /** 計測中の更新で、アプリ内の確認ダイアログを出しているか */
  confirmingInstall: boolean
  confirmInstall: () => void
  cancelInstall: () => void
  dismiss: () => void
}

/** アップデート状態の購読と操作（ポップオーバー・設定で共有） */
export function useUpdate(): UpdateState {
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkedUpToDate, setCheckedUpToDate] = useState(false)
  // 確認ダイアログを出している間、承認の対象になっているバージョン（出していなければ null）
  const [confirmingVersion, setConfirmingVersion] = useState<string | null>(null)

  useEffect(() => {
    // マウント時に現在のバージョンを取得する（ネットワーク不要）
    let alive = true
    updateRepository.getCurrentVersion()
      .then(v => { if (alive) setCurrentVersion(v) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    // 起動時チェックの update-available は、レンダラーが購読を張る前に飛んでいることがある。
    // Tauri のイベントは再送されないので、マウント時に直近の結果を引き直して取りこぼしを拾う。
    let alive = true
    updateRepository.pending()
      .then(pending => {
        if (!alive || !pending) return
        setInfo(pending)
        // 既にイベントで先へ進んでいるときは巻き戻さない
        setPhase(p => (p === 'idle' ? 'available' : p))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const offAvail = updateRepository.onAvailable((i) => {
      setInfo(i)
      setPhase('available')
      // 確認を出した版と別の版が見つかったら、古い確認のままでは承認させない
      setConfirmingVersion(v => (v !== null && v !== i.latestVersion ? null : v))
    })
    const offProg = updateRepository.onProgress((p) => {
      if (p.error) {
        setError(p.error)
        setPhase('error')
        return
      }
      setPercent(p.percent)
      setPhase(p.done ? 'installing' : 'downloading')
    })
    return () => { offAvail(); offProg() }
  }, [])

  const check = async (): Promise<void> => {
    setChecking(true)
    setError(null)
    const started = Date.now()
    try {
      const result = await updateRepository.check()
      setInfo(result)
      if (result.hasUpdate) {
        setPhase('available')
        setCheckedUpToDate(false)
      } else {
        setPhase('idle')
        setCheckedUpToDate(true)
      }
    } catch {
      setError('確認に失敗しました')
      setPhase('error')
      setCheckedUpToDate(false)
    } finally {
      // ネットワーク確認は一瞬で終わるため、最低 600ms は確認中表示を保持する
      const elapsed = Date.now() - started
      if (elapsed < 600) {
        await new Promise(resolve => setTimeout(resolve, 600 - elapsed))
      }
      setChecking(false)
    }
  }

  const startInstall = (version: string): void => {
    setError(null)
    setPercent(0)
    setPhase('downloading')
    setCheckedUpToDate(false)
    updateRepository.install(version).catch(() => {
      setError('更新に失敗しました')
      setPhase('error')
    })
  }

  const install = (): void => {
    // 更新情報が無ければ承認する版が無いので何もしない
    if (!info) return
    // 押した時点の版を承認の対象にする。確認中に新しい版が見つかっても、その版は承認していない。
    const version = info.latestVersion
    void (async () => {
      const running = await timerRepository.isRunning().catch(() => false)
      if (running) {
        setConfirmingVersion(version)
        return
      }
      startInstall(version)
    })()
  }

  const confirmInstall = (): void => {
    if (confirmingVersion === null) return
    setConfirmingVersion(null)
    startInstall(confirmingVersion)
  }

  const cancelInstall = (): void => {
    setConfirmingVersion(null)
  }

  const dismiss = (): void => {
    if (info) updateRepository.dismiss(info.latestVersion).catch(console.error)
    setPhase('idle')
  }

  return {
    phase, info, percent, error, currentVersion, checking, checkedUpToDate,
    check, install, confirmingInstall: confirmingVersion !== null, confirmInstall, cancelInstall, dismiss,
  }
}
