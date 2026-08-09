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
const mockPending = vi.fn()

vi.mock('../repositories/updateRepository', () => ({
  updateRepository: {
    check: () => mockCheck(),
    install: () => mockInstall(),
    dismiss: (v: string) => mockDismiss(v),
    getCurrentVersion: () => mockGetCurrentVersion(),
    pending: () => mockPending(),
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
  mockPending.mockResolvedValue(null)
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

  it('check 中は checking=true になり、完了後 false に戻る', async () => {
    mockCheck.mockResolvedValue({ ...info, hasUpdate: false })
    const { result } = renderHook(() => useUpdate())
    act(() => { void result.current.check() })
    await waitFor(() => expect(result.current.checking).toBe(true))
    await waitFor(() => expect(result.current.checking).toBe(false))
  })

  it('更新なしの確認後は checkedUpToDate=true', async () => {
    mockCheck.mockResolvedValue({ ...info, hasUpdate: false })
    const { result } = renderHook(() => useUpdate())
    await act(async () => { await result.current.check() })
    await waitFor(() => expect(result.current.checkedUpToDate).toBe(true))
    expect(result.current.phase).toBe('idle')
  })

  it('更新ありの確認後は checkedUpToDate=false', async () => {
    mockCheck.mockResolvedValue(info)
    const { result } = renderHook(() => useUpdate())
    await act(async () => { await result.current.check() })
    await waitFor(() => expect(result.current.phase).toBe('available'))
    expect(result.current.checkedUpToDate).toBe(false)
  })

  it('確認失敗で checkedUpToDate=false・checking=false', async () => {
    mockCheck.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useUpdate())
    await act(async () => { await result.current.check() })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.checkedUpToDate).toBe(false)
    expect(result.current.checking).toBe(false)
  })

  it('install 開始で checkedUpToDate=false に戻す', async () => {
    mockCheck.mockResolvedValue({ ...info, hasUpdate: false })
    const { result } = renderHook(() => useUpdate())
    await act(async () => { await result.current.check() })
    await waitFor(() => expect(result.current.checkedUpToDate).toBe(true))
    act(() => { result.current.install() })
    await waitFor(() => expect(result.current.checkedUpToDate).toBe(false))
  })

  // 起動時チェックの update-available はレンダラーが購読する前に飛ぶため取りこぼす。
  // マウント時に直近の結果を引き直すことで、取りこぼしても拾えるようにする。
  it('マウント時に直近のチェック結果を引き、更新があれば available にする', async () => {
    mockPending.mockResolvedValue(info)
    const { result } = renderHook(() => useUpdate())
    await waitFor(() => expect(result.current.phase).toBe('available'))
    expect(result.current.info?.latestVersion).toBe('1.1.0')
  })

  it('直近のチェック結果が無ければ idle のまま', async () => {
    mockPending.mockResolvedValue(null)
    const { result } = renderHook(() => useUpdate())
    await waitFor(() => expect(mockPending).toHaveBeenCalled())
    expect(result.current.phase).toBe('idle')
  })

  it('直近のチェック結果の取得に失敗しても phase を壊さない', async () => {
    mockPending.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useUpdate())
    await waitFor(() => expect(mockPending).toHaveBeenCalled())
    expect(result.current.phase).toBe('idle')
  })

  it('先に進んだ phase を、あとから解決したマウント時の取得が巻き戻さない', async () => {
    let resolvePending: (v: UpdateInfo | null) => void = () => {}
    mockPending.mockReturnValue(new Promise<UpdateInfo | null>(r => { resolvePending = r }))
    const { result } = renderHook(() => useUpdate())
    act(() => handlers.available!(info))
    act(() => handlers.progress!({ percent: 30, done: false }))
    expect(result.current.phase).toBe('downloading')
    await act(async () => { resolvePending(info) })
    expect(result.current.phase).toBe('downloading')
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
