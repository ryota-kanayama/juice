import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { UpdateInfo } from '../../../shared/types'
import { updateRepository } from '../repositories/updateRepository'
import { timerRepository } from '../repositories/timerRepository'

const handlers: {
  available?: (i: UpdateInfo) => void
  progress?: (p: { percent: number; done: boolean; error?: string }) => void
} = {}

const mockCheck = vi.fn()
const mockInstall = vi.fn()
const mockDismiss = vi.fn()
const mockGetCurrentVersion = vi.fn()

vi.mock('../repositories/updateRepository', () => ({
  updateRepository: {
    check: () => mockCheck(),
    install: () => mockInstall(),
    dismiss: (v: string) => mockDismiss(v),
    getCurrentVersion: () => mockGetCurrentVersion(),
    onAvailable: (cb: (i: UpdateInfo) => void) => { handlers.available = cb; return () => {} },
    onProgress: (cb: (p: { percent: number; done: boolean; error?: string }) => void) => { handlers.progress = cb; return () => {} },
  },
}))

const mockIsRunning = vi.fn()

vi.mock('../repositories/timerRepository', () => ({
  timerRepository: {
    isRunning: () => mockIsRunning(),
  },
}))

import { useUpdate } from './useUpdate'

const info: UpdateInfo = {
  currentVersion: '1.0.0', latestVersion: '1.1.0', hasUpdate: true,
  releaseUrl: 'u', downloadUrl: 'd', assetName: 'Juice-1.1.0-arm64.dmg', notes: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheck.mockResolvedValue({ ...info, hasUpdate: false })
  mockDismiss.mockResolvedValue(undefined)
  mockInstall.mockResolvedValue(undefined)
  mockGetCurrentVersion.mockResolvedValue('1.0.0')
  mockIsRunning.mockResolvedValue(false)
})

describe('useUpdate', () => {
  it('update-available で phase=available・info を反映', async () => {
    const { result } = renderHook(() => useUpdate())
    act(() => handlers.available!(info))
    expect(result.current.phase).toBe('available')
    expect(result.current.info?.latestVersion).toBe('1.1.0')
  })

  it('進捗イベントで downloading→opened に進む', async () => {
    const { result } = renderHook(() => useUpdate())
    act(() => handlers.available!(info))
    act(() => handlers.progress!({ percent: 40, done: false }))
    expect(result.current.phase).toBe('downloading')
    expect(result.current.percent).toBe(40)
    act(() => handlers.progress!({ percent: 100, done: true }))
    expect(result.current.phase).toBe('installing')
  })

  it('進捗 error で phase=error', () => {
    const { result } = renderHook(() => useUpdate())
    act(() => handlers.progress!({ percent: 0, done: true, error: '失敗' }))
    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('失敗')
  })

  it('dismiss は repo.dismiss を呼び phase=idle', () => {
    const { result } = renderHook(() => useUpdate())
    act(() => handlers.available!(info))
    act(() => result.current.dismiss())
    expect(mockDismiss).toHaveBeenCalledWith('1.1.0')
    expect(result.current.phase).toBe('idle')
  })

  it('check は repo.check の結果が更新ありなら available', async () => {
    mockCheck.mockResolvedValue(info)
    const { result } = renderHook(() => useUpdate())
    await act(async () => { await result.current.check() })
    await waitFor(() => expect(result.current.phase).toBe('available'))
  })

  it('check 成功で hasUpdate=false なら phase=idle', async () => {
    mockCheck.mockResolvedValue({ ...info, hasUpdate: false })
    const { result } = renderHook(() => useUpdate())
    await act(async () => { await result.current.check() })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
  })

  it('check 失敗時に phase=error・error メッセージを設定', async () => {
    mockCheck.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useUpdate())
    await act(async () => { await result.current.check() })
    await waitFor(() => {
      expect(result.current.phase).toBe('error')
      expect(result.current.error).toBe('確認に失敗しました')
    })
  })

  it('マウント時に currentVersion を取得する', async () => {
    mockGetCurrentVersion.mockResolvedValue('2.0.0')
    const { result } = renderHook(() => useUpdate())
    await waitFor(() => expect(result.current.currentVersion).toBe('2.0.0'))
  })
})

describe('useUpdate.install', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('タイマー非稼働ならそのまま install を呼ぶ', async () => {
    vi.spyOn(timerRepository, 'isRunning').mockResolvedValue(false)
    const spy = vi.spyOn(updateRepository, 'install').mockResolvedValue()
    const { result } = renderHook(() => useUpdate())
    act(() => { result.current.install() })
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(result.current.phase).toBe('downloading')
  })

  it('稼働中に確認をキャンセルしたら install を呼ばない', async () => {
    vi.spyOn(timerRepository, 'isRunning').mockResolvedValue(true)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const spy = vi.spyOn(updateRepository, 'install').mockResolvedValue()
    const { result } = renderHook(() => useUpdate())
    act(() => { result.current.install() })
    await waitFor(() => expect(timerRepository.isRunning).toHaveBeenCalled())
    expect(spy).not.toHaveBeenCalled()
  })
})
