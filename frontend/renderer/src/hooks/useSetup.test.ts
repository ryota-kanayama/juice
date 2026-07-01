import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockGetTheme = vi.fn()
const mockSetTheme = vi.fn()
const mockOnThemeChanged = vi.fn()
const mockGetWhiteboard = vi.fn()
const mockSetWhiteboard = vi.fn()
const mockGetMainProjectCode = vi.fn()
const mockSetMainProjectCode = vi.fn()
const mockCompleteSetup = vi.fn()

vi.mock('../repositories/settingsRepository', () => ({
  settingsRepository: {
    getTheme: () => mockGetTheme(),
    setTheme: (t: string) => mockSetTheme(t),
    onThemeChanged: (cb: (t: string) => void) => mockOnThemeChanged(cb),
    getWhiteboard: () => mockGetWhiteboard(),
    setWhiteboard: (e: boolean) => mockSetWhiteboard(e),
    getMainProjectCode: () => mockGetMainProjectCode(),
    setMainProjectCode: (c: string) => mockSetMainProjectCode(c),
    completeSetup: () => mockCompleteSetup(),
  },
}))

const mockApplyTheme = vi.fn()
vi.mock('../theme/applyTheme', () => ({ applyTheme: (t: string) => mockApplyTheme(t) }))

import { useSetup } from './useSetup'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTheme.mockResolvedValue('milk')
  mockOnThemeChanged.mockReturnValue(() => {})
  mockGetWhiteboard.mockResolvedValue({ enabled: false })
  mockGetMainProjectCode.mockResolvedValue('')
  mockSetTheme.mockResolvedValue(undefined)
  mockSetWhiteboard.mockResolvedValue(undefined)
  mockSetMainProjectCode.mockResolvedValue(undefined)
  mockCompleteSetup.mockResolvedValue(undefined)
})

describe('useSetup', () => {
  it('初期ロードで取得した設定値を反映する', async () => {
    mockGetTheme.mockResolvedValue('rose')
    mockGetWhiteboard.mockResolvedValue({ enabled: true })
    mockGetMainProjectCode.mockResolvedValue('PJ-1')
    const { result } = renderHook(() => useSetup())
    await waitFor(() => expect(result.current.activeThemeId).toBe('rose'))
    expect(result.current.whiteboardEnabled).toBe(true)
    expect(result.current.mainProjectCode).toBe('PJ-1')
  })

  it('setTheme で applyTheme と永続化を呼び state を更新する', async () => {
    const { result } = renderHook(() => useSetup())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setTheme('graphite'))
    expect(mockApplyTheme).toHaveBeenCalledWith('graphite')
    expect(mockSetTheme).toHaveBeenCalledWith('graphite')
    expect(result.current.activeThemeId).toBe('graphite')
  })

  it('setWhiteboard で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSetup())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setWhiteboard(true))
    expect(mockSetWhiteboard).toHaveBeenCalledWith(true)
    expect(result.current.whiteboardEnabled).toBe(true)
  })

  it('setMainProjectCode で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSetup())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setMainProjectCode('PJ-9'))
    expect(mockSetMainProjectCode).toHaveBeenCalledWith('PJ-9')
    expect(result.current.mainProjectCode).toBe('PJ-9')
  })

  it('complete で completeSetup を呼ぶ', async () => {
    const { result } = renderHook(() => useSetup())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    await act(async () => { await result.current.complete() })
    expect(mockCompleteSetup).toHaveBeenCalled()
  })

  it('onThemeChanged の購読をアンマウントで解除する', async () => {
    const off = vi.fn()
    mockOnThemeChanged.mockReturnValue(off)
    const { unmount, result } = renderHook(() => useSetup())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    unmount()
    expect(off).toHaveBeenCalled()
  })
})
