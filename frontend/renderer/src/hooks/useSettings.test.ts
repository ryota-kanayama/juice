import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import type { SettingsState } from './useSettings'

const repo = vi.hoisted(() => ({
  getTheme: vi.fn(),
  setTheme: vi.fn(),
  onThemeChanged: vi.fn(),
  getIdle: vi.fn(),
  setIdle: vi.fn(),
  getElapsed: vi.fn(),
  setElapsed: vi.fn(),
  getPomodoro: vi.fn(),
  setPomodoro: vi.fn(),
  getWhiteboard: vi.fn(),
  setWhiteboard: vi.fn(),
  getBreakBehavior: vi.fn(),
  setBreakBehavior: vi.fn(),
  getMainProjectCode: vi.fn(),
  setMainProjectCode: vi.fn(),
  getLaunchAtLogin: vi.fn(),
  setLaunchAtLogin: vi.fn(),
}))
vi.mock('../repositories/settingsRepository', () => ({ settingsRepository: repo }))

const mockApplyTheme = vi.fn()
vi.mock('../theme/applyTheme', () => ({ applyTheme: (t: string) => mockApplyTheme(t) }))

import { useSettings } from './useSettings'

let themeChanged: ((themeId: string) => void) | null = null
const offThemeChanged = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  repo.getTheme.mockResolvedValue('milk')
  repo.onThemeChanged.mockImplementation((cb: (t: string) => void) => {
    themeChanged = cb
    return offThemeChanged
  })
  repo.getIdle.mockResolvedValue({ enabled: false, minutes: 60 })
  repo.getElapsed.mockResolvedValue({ enabled: false, minutes: 30 })
  repo.getPomodoro.mockResolvedValue({ enabled: false })
  repo.getWhiteboard.mockResolvedValue({ enabled: false })
  repo.getBreakBehavior.mockResolvedValue({ behavior: 'stop' })
  repo.getMainProjectCode.mockResolvedValue('')
  repo.getLaunchAtLogin.mockResolvedValue(false)
})

type Hook = RenderHookResult<SettingsState, unknown>

async function renderLoaded(): Promise<Hook> {
  const hook = renderHook(() => useSettings())
  await act(async () => {})
  return hook
}

describe('useSettings', () => {
  describe('初回の読み込み', () => {
    it('保存済みの設定をすべて反映する', async () => {
      repo.getTheme.mockResolvedValue('soda')
      repo.getIdle.mockResolvedValue({ enabled: true, minutes: 45 })
      repo.getElapsed.mockResolvedValue({ enabled: true, minutes: 25 })
      repo.getPomodoro.mockResolvedValue({ enabled: true })
      repo.getWhiteboard.mockResolvedValue({ enabled: true })
      repo.getBreakBehavior.mockResolvedValue({ behavior: 'pause' })
      repo.getMainProjectCode.mockResolvedValue('PJ-1')
      repo.getLaunchAtLogin.mockResolvedValue(true)

      const { result } = await renderLoaded()

      expect(result.current).toMatchObject({
        activeThemeId: 'soda',
        idleEnabled: true,
        idleMinutes: 45,
        elapsedEnabled: true,
        elapsedMinutes: 25,
        pomodoroEnabled: true,
        whiteboardEnabled: true,
        breakBehavior: 'pause',
        mainProjectCode: 'PJ-1',
        launchAtLogin: true,
      })
    })
  })

  describe('他のウィンドウでのテーマ変更', () => {
    it('通知されたテーマを反映する', async () => {
      const { result } = await renderLoaded()

      act(() => { themeChanged!('graphite') })

      expect(result.current.activeThemeId).toBe('graphite')
    })

    it('アンマウントすると購読を解除する', async () => {
      const { unmount } = await renderLoaded()

      unmount()

      expect(offThemeChanged).toHaveBeenCalledOnce()
    })
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

  // 各 setter は「保存する」と「画面の状態を変える」の2つを行う
  const setters: Array<{
    name: string
    call: (s: SettingsState) => void
    saved: [keyof typeof repo, unknown[]]
    state: Partial<SettingsState>
  }> = [
    { name: 'setIdle', call: s => s.setIdle(true, 90), saved: ['setIdle', [true, 90]], state: { idleEnabled: true, idleMinutes: 90 } },
    { name: 'setElapsed', call: s => s.setElapsed(true, 15), saved: ['setElapsed', [true, 15]], state: { elapsedEnabled: true, elapsedMinutes: 15 } },
    { name: 'setPomodoro', call: s => s.setPomodoro(true), saved: ['setPomodoro', [true]], state: { pomodoroEnabled: true } },
    { name: 'setWhiteboard', call: s => s.setWhiteboard(true), saved: ['setWhiteboard', [true]], state: { whiteboardEnabled: true } },
    { name: 'setBreakBehavior', call: s => s.setBreakBehavior('pause'), saved: ['setBreakBehavior', ['pause']], state: { breakBehavior: 'pause' } },
    { name: 'setMainProjectCode', call: s => s.setMainProjectCode('PJ-9'), saved: ['setMainProjectCode', ['PJ-9']], state: { mainProjectCode: 'PJ-9' } },
    { name: 'setLaunchAtLogin', call: s => s.setLaunchAtLogin(true), saved: ['setLaunchAtLogin', [true]], state: { launchAtLogin: true } },
  ]

  describe.each(setters)('$name', ({ call, saved: [method, args], state }) => {
    it('保存する', async () => {
      const { result } = await renderLoaded()

      act(() => call(result.current))

      expect(repo[method]).toHaveBeenCalledWith(...args)
    })

    it('画面の状態を変える', async () => {
      const { result } = await renderLoaded()

      act(() => call(result.current))

      expect(result.current).toMatchObject(state)
    })
  })
})
