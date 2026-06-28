import { useEffect, useState } from 'react'
import { updateRepository } from '../repositories/updateRepository'
import type { UpdateInfo } from '../../../shared/types'

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'opened' | 'installed' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  info: UpdateInfo | null
  percent: number
  error: string | null
  check: () => Promise<void>
  download: () => void
  restart: () => void
  dismiss: () => void
}

/** アップデート状態の購読と操作（ポップオーバー・設定で共有） */
export function useUpdate(): UpdateState {
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)

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
      setPhase(p.done ? 'opened' : 'downloading')
    })
    const offInst = updateRepository.onInstalled(() => setPhase('installed'))
    return () => { offAvail(); offProg(); offInst() }
  }, [])

  const check = async (): Promise<void> => {
    const result = await updateRepository.check()
    setInfo(result)
    if (result.hasUpdate) setPhase('available')
  }

  const download = (): void => {
    setError(null)
    setPercent(0)
    setPhase('downloading')
    updateRepository.download().catch(() => {
      setError('ダウンロードに失敗しました')
      setPhase('error')
    })
  }

  const restart = (): void => {
    updateRepository.restart().catch(console.error)
  }

  const dismiss = (): void => {
    if (info) void Promise.resolve(updateRepository.dismiss(info.latestVersion)).catch(console.error)
    setPhase('idle')
  }

  return { phase, info, percent, error, check, download, restart, dismiss }
}
