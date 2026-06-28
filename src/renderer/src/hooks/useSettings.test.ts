import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockGetTheme = vi.fn()
const mockSetTheme = vi.fn()
const mockOnThemeChanged = vi.fn()
const mockGetIdle = vi.fn()
const mockSetIdle = vi.fn()
const mockGetElapsed = vi.fn()
const mockSetElapsed = vi.fn()
const mockGetPomodoro = vi.fn()
const mockSetPomodoro = vi.fn()
const mockGetWhiteboard = vi.fn()
const mockSetWhiteboard = vi.fn()
const mockGetBreakBehavior = vi.fn()
const mockSetBreakBehavior = vi.fn()
const mockGetMainProjectCode = vi.fn()
const mockSetMainProjectCode = vi.fn()
const mockGetLaunchAtLogin = vi.fn()
const mockSetLaunchAtLogin = vi.fn()

vi.mock('../repositories/settingsRepository', () => ({
  settingsRepository: {
    getTheme: () => mockGetTheme(),
    setTheme: (t: string) => mockSetTheme(t),
    onThemeChanged: (cb: (t: string) => void) => mockOnThemeChanged(cb),
    getIdle: () => mockGetIdle(),
    setIdle: (e: boolean, m: number) => mockSetIdle(e, m),
    getElapsed: () => mockGetElapsed(),
    setElapsed: (e: boolean, m: number) => mockSetElapsed(e, m),
    getPomodoro: () => mockGetPomodoro(),
    setPomodoro: (e: boolean) => mockSetPomodoro(e),
    getWhiteboard: () => mockGetWhiteboard(),
    setWhiteboard: (e: boolean) => mockSetWhiteboard(e),
    getBreakBehavior: () => mockGetBreakBehavior(),
    setBreakBehavior: (b: string) => mockSetBreakBehavior(b),
    getMainProjectCode: () => mockGetMainProjectCode(),
    setMainProjectCode: (c: string) => mockSetMainProjectCode(c),
    getLaunchAtLogin: () => mockGetLaunchAtLogin(),
    setLaunchAtLogin: (e: boolean) => mockSetLaunchAtLogin(e),
  },
}))

const mockApplyTheme = vi.fn()
vi.mock('../theme/applyTheme', () => ({ applyTheme: (t: string) => mockApplyTheme(t) }))

import { useSettings } from './useSettings'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTheme.mockResolvedValue('milk')
  mockOnThemeChanged.mockReturnValue(() => {})
  mockGetIdle.mockResolvedValue({ enabled: false, minutes: 60 })
  mockGetElapsed.mockResolvedValue({ enabled: false, minutes: 30 })
  mockGetPomodoro.mockResolvedValue({ enabled: false })
  mockGetWhiteboard.mockResolvedValue({ enabled: false })
  mockGetBreakBehavior.mockResolvedValue({ behavior: 'stop' })
  mockGetMainProjectCode.mockResolvedValue('')
  mockGetLaunchAtLogin.mockResolvedValue(false)
})

describe('useSettings', () => {
  it('初期ロードで全設定を反映する', async () => {
    mockGetTheme.mockResolvedValue('rose')
    mockGetIdle.mockResolvedValue({ enabled: true, minutes: 45 })
    mockGetElapsed.mockResolvedValue({ enabled: true, minutes: 25 })
    mockGetPomodoro.mockResolvedValue({ enabled: true })
    mockGetWhiteboard.mockResolvedValue({ enabled: true })
    mockGetBreakBehavior.mockResolvedValue({ behavior: 'pause' })
    mockGetMainProjectCode.mockResolvedValue('PJ-1')

    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('rose'))
    expect(result.current.idleEnabled).toBe(true)
    expect(result.current.idleMinutes).toBe(45)
    expect(result.current.elapsedEnabled).toBe(true)
    expect(result.current.elapsedMinutes).toBe(25)
    expect(result.current.pomodoroEnabled).toBe(true)
    expect(result.current.whiteboardEnabled).toBe(true)
    expect(result.current.breakBehavior).toBe('pause')
    expect(result.current.mainProjectCode).toBe('PJ-1')
  })

  it('setTheme で applyTheme と永続化を呼び state を更新する', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setTheme('graphite'))
    expect(mockApplyTheme).toHaveBeenCalledWith('graphite')
    expect(mockSetTheme).toHaveBeenCalledWith('graphite')
    expect(result.current.activeThemeId).toBe('graphite')
  })

  it('setIdle で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setIdle(true, 90))
    expect(mockSetIdle).toHaveBeenCalledWith(true, 90)
    expect(result.current.idleEnabled).toBe(true)
    expect(result.current.idleMinutes).toBe(90)
  })

  it('setElapsed で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setElapsed(true, 15))
    expect(mockSetElapsed).toHaveBeenCalledWith(true, 15)
    expect(result.current.elapsedEnabled).toBe(true)
    expect(result.current.elapsedMinutes).toBe(15)
  })

  it('setPomodoro で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setPomodoro(true))
    expect(mockSetPomodoro).toHaveBeenCalledWith(true)
    expect(result.current.pomodoroEnabled).toBe(true)
  })

  it('setBreakBehavior で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setBreakBehavior('pause'))
    expect(mockSetBreakBehavior).toHaveBeenCalledWith('pause')
    expect(result.current.breakBehavior).toBe('pause')
  })

  it('setMainProjectCode で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setMainProjectCode('PJ-9'))
    expect(mockSetMainProjectCode).toHaveBeenCalledWith('PJ-9')
    expect(result.current.mainProjectCode).toBe('PJ-9')
  })

  it('初期ロードで launchAtLogin を反映する', async () => {
    mockGetLaunchAtLogin.mockResolvedValue(true)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.launchAtLogin).toBe(true))
  })

  it('setLaunchAtLogin で永続化と state を更新する', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.activeThemeId).toBe('milk'))
    act(() => result.current.setLaunchAtLogin(true))
    expect(mockSetLaunchAtLogin).toHaveBeenCalledWith(true)
    expect(result.current.launchAtLogin).toBe(true)
  })
})
