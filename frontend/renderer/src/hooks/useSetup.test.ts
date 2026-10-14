import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import type { SetupState } from './useSetup'

const repo = vi.hoisted(() => ({
  getTheme: vi.fn(),
  setTheme: vi.fn(),
  onThemeChanged: vi.fn(),
  getWhiteboard: vi.fn(),
  setWhiteboard: vi.fn(),
  getMainProjectCode: vi.fn(),
  setMainProjectCode: vi.fn(),
  completeSetup: vi.fn(),
}))
vi.mock('../repositories/settingsRepository', () => ({ settingsRepository: repo }))

const mockApplyTheme = vi.fn()
vi.mock('../theme/applyTheme', () => ({ applyTheme: (t: string) => mockApplyTheme(t) }))

import { useSetup } from './useSetup'

let themeChanged: ((themeId: string) => void) | null = null
const offThemeChanged = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  repo.getTheme.mockResolvedValue('milk')
  repo.onThemeChanged.mockImplementation((cb: (t: string) => void) => {
    themeChanged = cb
    return offThemeChanged
  })
  repo.getWhiteboard.mockResolvedValue({ enabled: false })
  repo.getMainProjectCode.mockResolvedValue('')
  repo.completeSetup.mockResolvedValue(undefined)
})

type Hook = RenderHookResult<SetupState, unknown>

async function renderLoaded(): Promise<Hook> {
  const hook = renderHook(() => useSetup())
  await act(async () => {})
  return hook
}

describe('useSetup', () => {
  it('保存済みのテーマ・連携設定を読み込む', async () => {
    repo.getTheme.mockResolvedValue('soda')
    repo.getWhiteboard.mockResolvedValue({ enabled: true })
    repo.getMainProjectCode.mockResolvedValue('PJ-1')

    const { result } = await renderLoaded()

    expect(result.current).toMatchObject({ activeThemeId: 'soda', whiteboardEnabled: true, mainProjectCode: 'PJ-1' })
  })

  describe('setTheme', () => {
    it('保存を待たずにテーマを画面へ適用する', async () => {
      const { result } = await renderLoaded()

      act(() => result.current.setTheme('graphite'))

      expect(mockApplyTheme).toHaveBeenCalledWith('graphite')
    })

    it('保存する', async () => {
      const { result } = await renderLoaded()

      act(() => result.current.setTheme('graphite'))

      expect(repo.setTheme).toHaveBeenCalledWith('graphite')
    })

    it('選択中のテーマを変える', async () => {
      const { result } = await renderLoaded()

      act(() => result.current.setTheme('graphite'))

      expect(result.current.activeThemeId).toBe('graphite')
    })
  })

  describe('setWhiteboard', () => {
    it('保存する', async () => {
      const { result } = await renderLoaded()

      act(() => result.current.setWhiteboard(true))

      expect(repo.setWhiteboard).toHaveBeenCalledWith(true)
    })

    it('画面の状態を変える', async () => {
      const { result } = await renderLoaded()

      act(() => result.current.setWhiteboard(true))

      expect(result.current.whiteboardEnabled).toBe(true)
    })
  })

  describe('setMainProjectCode', () => {
    it('保存する', async () => {
      const { result } = await renderLoaded()

      act(() => result.current.setMainProjectCode('PJ-9'))

      expect(repo.setMainProjectCode).toHaveBeenCalledWith('PJ-9')
    })

    it('画面の状態を変える', async () => {
      const { result } = await renderLoaded()

      act(() => result.current.setMainProjectCode('PJ-9'))

      expect(result.current.mainProjectCode).toBe('PJ-9')
    })
  })

  it('complete でセットアップ完了を保存する', async () => {
    const { result } = await renderLoaded()

    await act(async () => { await result.current.complete() })

    expect(repo.completeSetup).toHaveBeenCalledOnce()
  })

  it('他のウィンドウで変わったテーマを反映する', async () => {
    const { result } = await renderLoaded()

    act(() => { themeChanged!('graphite') })

    expect(result.current.activeThemeId).toBe('graphite')
  })

  it('アンマウントするとテーマ変更の購読を解除する', async () => {
    const { unmount } = await renderLoaded()

    unmount()

    expect(offThemeChanged).toHaveBeenCalledOnce()
  })
})
