import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  vi.spyOn(console, 'error').mockImplementation(() => {})
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

/** run の間とその直後に発生した unhandled rejection の理由を集める */
async function collectUnhandledRejections(run: () => Promise<void>): Promise<unknown[]> {
  const reasons: unknown[] = []
  const onRejection = (reason: unknown): void => { reasons.push(reason) }
  process.on('unhandledRejection', onRejection)
  try {
    await run()
    // unhandledRejection は microtask を流した後の次の macrotask で通知される
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    process.off('unhandledRejection', onRejection)
  }
  return reasons
}

const loadFailure = new Error('load failed')
const saveFailure = new Error('disk full')

// vi.fn は返した Promise に自前で then を付けて結果を記録するため、呼び出し側が
// 返り値を捨てても unhandled rejection にならない。捨てたことを検知できるよう、
// unhandled rejection のテストでは素の関数に差し替えて、保存を必ず失敗させる。
const replaced = new Map<keyof typeof repo, unknown>()
function failSaveWithPlainPromise(method: keyof typeof repo): void {
  replaced.set(method, repo[method])
  ;(repo as Record<string, unknown>)[method] = () => Promise.reject(saveFailure)
}
afterEach(() => {
  for (const [method, original] of replaced) (repo as Record<string, unknown>)[method] = original
  replaced.clear()
})

type Getter = 'getTheme' | 'getIdle' | 'getElapsed' | 'getPomodoro' | 'getWhiteboard'
  | 'getBreakBehavior' | 'getMainProjectCode' | 'getLaunchAtLogin'
const getters: Getter[] = [
  'getTheme', 'getIdle', 'getElapsed', 'getPomodoro', 'getWhiteboard',
  'getBreakBehavior', 'getMainProjectCode', 'getLaunchAtLogin',
]

describe('useSettings', () => {
  describe('初回の読み込みに失敗したとき', () => {
    it('すべての設定が既定値のままになる', async () => {
      for (const getter of getters) repo[getter].mockRejectedValue(loadFailure)

      const { result } = await renderLoaded()

      expect(result.current).toMatchObject({
        activeThemeId: 'milk',
        idleEnabled: false,
        idleMinutes: 60,
        elapsedEnabled: false,
        elapsedMinutes: 30,
        pomodoroEnabled: false,
        whiteboardEnabled: false,
        breakBehavior: 'stop',
        mainProjectCode: '',
        launchAtLogin: false,
      })
    })

    describe.each(getters)('%s', getter => {
      it('unhandled rejection を出さない', async () => {
        repo[getter].mockRejectedValue(loadFailure)

        const reasons = await collectUnhandledRejections(async () => { await renderLoaded() })

        expect(reasons).toEqual([])
      })

      it('原因を console.error に出す', async () => {
        repo[getter].mockRejectedValue(loadFailure)

        await renderLoaded()

        expect(vi.mocked(console.error).mock.calls.flat()).toContain(loadFailure)
      })
    })
  })

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

    describe('保存に失敗したとき', () => {
      it('ディスクのテーマを選択中に戻す', async () => {
        const { result } = await renderLoaded()
        repo.setTheme.mockRejectedValue(saveFailure)
        repo.getTheme.mockResolvedValue('soda')

        await act(async () => { result.current.setTheme('graphite') })

        expect(result.current.activeThemeId).toBe('soda')
      })

      it('ディスクのテーマで画面へ適用し直す', async () => {
        const { result } = await renderLoaded()
        repo.setTheme.mockRejectedValue(saveFailure)
        repo.getTheme.mockResolvedValue('soda')

        await act(async () => { result.current.setTheme('graphite') })

        expect(mockApplyTheme).toHaveBeenLastCalledWith('soda')
      })

      it('原因を console.error に出す', async () => {
        const { result } = await renderLoaded()
        repo.setTheme.mockRejectedValue(saveFailure)

        await act(async () => { result.current.setTheme('graphite') })

        expect(vi.mocked(console.error).mock.calls.flat()).toContain(saveFailure)
      })

      it('unhandled rejection を出さない', async () => {
        const { result } = await renderLoaded()
        failSaveWithPlainPromise('setTheme')

        const reasons = await collectUnhandledRejections(async () => {
          await act(async () => { result.current.setTheme('graphite') })
        })

        expect(reasons).toEqual([])
      })
    })
  })

  // 各 setter は「保存する」と「画面の状態を変える」の2つを行う
  const setters: Array<{
    name: string
    call: (s: SettingsState) => void
    saved: [keyof typeof repo, unknown[]]
    state: Partial<SettingsState>
    // 保存失敗後の読み直しで返るディスクの値と、それが画面に戻ったときの状態
    disk: [Getter, unknown]
    restored: Partial<SettingsState>
  }> = [
    { name: 'setIdle', call: s => s.setIdle(true, 90), saved: ['setIdle', [true, 90]], state: { idleEnabled: true, idleMinutes: 90 } , disk: ['getIdle', { enabled: false, minutes: 30 }], restored: { idleEnabled: false, idleMinutes: 30 } },
    { name: 'setElapsed', call: s => s.setElapsed(true, 15), saved: ['setElapsed', [true, 15]], state: { elapsedEnabled: true, elapsedMinutes: 15 } , disk: ['getElapsed', { enabled: false, minutes: 50 }], restored: { elapsedEnabled: false, elapsedMinutes: 50 } },
    { name: 'setPomodoro', call: s => s.setPomodoro(true), saved: ['setPomodoro', [true]], state: { pomodoroEnabled: true } , disk: ['getPomodoro', { enabled: false }], restored: { pomodoroEnabled: false } },
    { name: 'setWhiteboard', call: s => s.setWhiteboard(true), saved: ['setWhiteboard', [true]], state: { whiteboardEnabled: true } , disk: ['getWhiteboard', { enabled: false }], restored: { whiteboardEnabled: false } },
    { name: 'setBreakBehavior', call: s => s.setBreakBehavior('pause'), saved: ['setBreakBehavior', ['pause']], state: { breakBehavior: 'pause' } , disk: ['getBreakBehavior', { behavior: 'stop' }], restored: { breakBehavior: 'stop' } },
    { name: 'setMainProjectCode', call: s => s.setMainProjectCode('PJ-9'), saved: ['setMainProjectCode', ['PJ-9']], state: { mainProjectCode: 'PJ-9' } , disk: ['getMainProjectCode', 'PJ-1'], restored: { mainProjectCode: 'PJ-1' } },
    { name: 'setLaunchAtLogin', call: s => s.setLaunchAtLogin(true), saved: ['setLaunchAtLogin', [true]], state: { launchAtLogin: true } , disk: ['getLaunchAtLogin', false], restored: { launchAtLogin: false } },
  ]

  describe.each(setters)('$name', ({ call, saved: [method, args], state, disk: [getter, diskValue], restored }) => {
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

    describe('保存に失敗したとき', () => {
      it('画面の値をディスクの値に戻す', async () => {
        const { result } = await renderLoaded()
        repo[method].mockRejectedValue(saveFailure)
        repo[getter].mockResolvedValue(diskValue)

        await act(async () => { call(result.current) })

        expect(result.current).toMatchObject(restored)
      })

      it('原因を console.error に出す', async () => {
        const { result } = await renderLoaded()
        repo[method].mockRejectedValue(saveFailure)

        await act(async () => { call(result.current) })

        expect(vi.mocked(console.error).mock.calls.flat()).toContain(saveFailure)
      })

      it('unhandled rejection を出さない', async () => {
        const { result } = await renderLoaded()
        failSaveWithPlainPromise(method)

        const reasons = await collectUnhandledRejections(async () => {
          await act(async () => { call(result.current) })
        })

        expect(reasons).toEqual([])
      })
    })
  })
})
