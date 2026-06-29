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
  check: () => Promise<void>
  install: () => void
  dismiss: () => void
}

/** アップデート状態の購読と操作（ポップオーバー・設定で共有） */
export function useUpdate(): UpdateState {
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')

  useEffect(() => {
    // マウント時に現在のバージョンを取得する（ネットワーク不要）
    let alive = true
    updateRepository.getCurrentVersion()
      .then(v => { if (alive) setCurrentVersion(v) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const offAvail = updateRepository.onAvailable((i) => {
      setInfo(i)
      setPhase('available')
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
    try {
      const result = await updateRepository.check()
      setInfo(result)
      setPhase(result.hasUpdate ? 'available' : 'idle')
    } catch {
      setError('確認に失敗しました')
      setPhase('error')
    }
  }

  const install = (): void => {
    void (async () => {
      const running = await timerRepository.isRunning().catch(() => false)
      if (running && !window.confirm('作業を保存して更新します。アプリが再起動します。よろしいですか？')) {
        return
      }
      setError(null)
      setPercent(0)
      setPhase('downloading')
      updateRepository.install().catch(() => {
        setError('更新に失敗しました')
        setPhase('error')
      })
    })()
  }

  const dismiss = (): void => {
    if (info) updateRepository.dismiss(info.latestVersion).catch(console.error)
    setPhase('idle')
  }

  return { phase, info, percent, error, currentVersion, check, install, dismiss }
}
