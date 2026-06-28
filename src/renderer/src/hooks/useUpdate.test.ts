import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { UpdateInfo } from '../../../shared/types'

const handlers: {
  available?: (i: UpdateInfo) => void
  progress?: (p: { percent: number; done: boolean; error?: string }) => void
  installed?: (p: { version: string }) => void
} = {}

const mockCheck = vi.fn()
const mockDownload = vi.fn()
const mockRestart = vi.fn()
const mockDismiss = vi.fn()
const mockGetCurrentVersion = vi.fn()

vi.mock('../repositories/updateRepository', () => ({
  updateRepository: {
    check: () => mockCheck(),
    download: () => mockDownload(),
    restart: () => mockRestart(),
    dismiss: (v: string) => mockDismiss(v),
    getCurrentVersion: () => mockGetCurrentVersion(),
    onAvailable: (cb: (i: UpdateInfo) => void) => { handlers.available = cb; return () => {} },
    onProgress: (cb: (p: { percent: number; done: boolean; error?: string }) => void) => { handlers.progress = cb; return () => {} },
    onInstalled: (cb: (p: { version: string }) => void) => { handlers.installed = cb; return () => {} },
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
  mockRestart.mockResolvedValue(undefined)
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
    expect(result.current.phase).toBe('opened')
  })

  it('進捗 error で phase=error', () => {
    const { result } = renderHook(() => useUpdate())
    act(() => handlers.progress!({ percent: 0, done: true, error: '失敗' }))
    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('失敗')
  })

  it('update-installed で phase=installed', () => {
    const { result } = renderHook(() => useUpdate())
    act(() => handlers.installed!({ version: '1.1.0' }))
    expect(result.current.phase).toBe('installed')
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

  it('restart: confirm=true のとき updateRepository.restart を呼ぶ', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useUpdate())
    await act(async () => { result.current.restart() })
    await waitFor(() => expect(mockRestart).toHaveBeenCalled())
  })

  it('restart: confirm=false のとき updateRepository.restart を呼ばない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useUpdate())
    await act(async () => { result.current.restart() })
    expect(mockRestart).not.toHaveBeenCalled()
  })

  it('restart: タイマー稼働中のとき confirm 文言に「稼働中」を含む', async () => {
    mockIsRunning.mockResolvedValue(true)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useUpdate())
    await act(async () => { result.current.restart() })
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(confirmSpy.mock.calls[0][0]).toContain('稼働中')
  })

  it('マウント時に currentVersion を取得する', async () => {
    mockGetCurrentVersion.mockResolvedValue('2.0.0')
    const { result } = renderHook(() => useUpdate())
    await waitFor(() => expect(result.current.currentVersion).toBe('2.0.0'))
  })
})
