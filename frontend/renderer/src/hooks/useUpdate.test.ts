import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, type RenderHookResult } from '@testing-library/react'
import type { UpdateInfo } from '../../../shared/types'
import type { UpdateState } from './useUpdate'

type Progress = { percent: number; done: boolean; error?: string }

const handlers: { available?: (i: UpdateInfo) => void; progress?: (p: Progress) => void } = {}
const mockCheck = vi.fn()
const mockInstall = vi.fn()
const mockDismiss = vi.fn()
const mockGetCurrentVersion = vi.fn()
const mockPending = vi.fn()
const mockIsRunning = vi.fn()

vi.mock('../repositories/updateRepository', () => ({
  updateRepository: {
    check: () => mockCheck(),
    install: (v?: string) => mockInstall(v),
    dismiss: (v: string) => mockDismiss(v),
    getCurrentVersion: () => mockGetCurrentVersion(),
    pending: () => mockPending(),
    onAvailable: (cb: (i: UpdateInfo) => void) => { handlers.available = cb; return () => {} },
    onProgress: (cb: (p: Progress) => void) => { handlers.progress = cb; return () => {} },
  },
}))
vi.mock('../repositories/timerRepository', () => ({
  timerRepository: { isRunning: () => mockIsRunning() },
}))

import { useUpdate } from './useUpdate'

const info: UpdateInfo = {
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  hasUpdate: true,
  releaseUrl: 'u',
  downloadUrl: 'd',
  assetName: 'Juice-1.1.0-arm64.dmg',
  notes: '',
}
const upToDate: UpdateInfo = { ...info, hasUpdate: false }

type Hook = RenderHookResult<UpdateState, unknown>['result']

function renderUpdate(): Hook {
  return renderHook(() => useUpdate()).result
}

/** check を呼び、最低表示時間（600ms）の待ちも含めて完了させる */
async function runCheck(hook: Hook): Promise<void> {
  await act(async () => {
    const done = hook.current.check()
    await vi.advanceTimersByTimeAsync(600)
    await done
  })
}

async function runInstall(hook: Hook): Promise<void> {
  await act(async () => { hook.current.install() })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockCheck.mockReset().mockResolvedValue(upToDate)
  mockInstall.mockReset().mockResolvedValue(undefined)
  mockDismiss.mockReset().mockResolvedValue(undefined)
  mockGetCurrentVersion.mockReset().mockResolvedValue('1.0.0')
  mockPending.mockReset().mockResolvedValue(null)
  mockIsRunning.mockReset().mockResolvedValue(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useUpdate', () => {
  describe('マウント時', () => {
    it('現在のバージョンを取得する', async () => {
      mockGetCurrentVersion.mockResolvedValue('2.0.0')

      const hook = renderUpdate()
      await act(async () => {})

      expect(hook.current.currentVersion).toBe('2.0.0')
    })

    // 起動時チェックの update-available はレンダラーが購読する前に飛ぶため取りこぼす。
    // マウント時に直近の結果を引き直して拾う
    it('直近のチェック結果に更新があれば available にする', async () => {
      mockPending.mockResolvedValue(info)

      const hook = renderUpdate()
      await act(async () => {})

      expect(hook.current.phase).toBe('available')
    })

    it('直近のチェック結果を info に持つ', async () => {
      mockPending.mockResolvedValue(info)

      const hook = renderUpdate()
      await act(async () => {})

      expect(hook.current.info).toEqual(info)
    })

    it('直近のチェック結果が無ければ idle のまま', async () => {
      mockPending.mockResolvedValue(null)

      const hook = renderUpdate()
      await act(async () => {})

      expect(hook.current.phase).toBe('idle')
    })

    it('直近のチェック結果の取得に失敗しても idle のまま', async () => {
      mockPending.mockRejectedValue(new Error('boom'))

      const hook = renderUpdate()
      await act(async () => {})

      expect(hook.current.phase).toBe('idle')
    })

    it('取得が遅れて届いても、イベントで先へ進んだ phase を巻き戻さない', async () => {
      let resolvePending: (v: UpdateInfo | null) => void = () => {}
      mockPending.mockReturnValue(new Promise<UpdateInfo | null>(r => { resolvePending = r }))
      const hook = renderUpdate()
      act(() => handlers.available!(info))
      act(() => handlers.progress!({ percent: 30, done: false }))

      await act(async () => { resolvePending(info) })

      expect(hook.current.phase).toBe('downloading')
    })
  })

  describe('イベント', () => {
    it('update-available で available になり info を持つ', () => {
      const hook = renderUpdate()

      act(() => handlers.available!(info))

      expect(hook.current).toMatchObject({ phase: 'available', info })
    })

    it('ダウンロード中の進捗で downloading になり percent を持つ', () => {
      const hook = renderUpdate()

      act(() => handlers.progress!({ percent: 40, done: false }))

      expect(hook.current).toMatchObject({ phase: 'downloading', percent: 40 })
    })

    it('完了の進捗で installing になる', () => {
      const hook = renderUpdate()

      act(() => handlers.progress!({ percent: 100, done: true }))

      expect(hook.current.phase).toBe('installing')
    })

    it('エラーの進捗で error になり、メッセージを持つ', () => {
      const hook = renderUpdate()

      act(() => handlers.progress!({ percent: 0, done: true, error: '失敗' }))

      expect(hook.current).toMatchObject({ phase: 'error', error: '失敗' })
    })
  })

  describe('check', () => {
    it('更新があれば available', async () => {
      mockCheck.mockResolvedValue(info)
      const hook = renderUpdate()

      await runCheck(hook)

      expect(hook.current.phase).toBe('available')
    })

    it('更新があれば checkedUpToDate は false', async () => {
      mockCheck.mockResolvedValue(info)
      const hook = renderUpdate()

      await runCheck(hook)

      expect(hook.current.checkedUpToDate).toBe(false)
    })

    it('更新が無ければ idle', async () => {
      const hook = renderUpdate()

      await runCheck(hook)

      expect(hook.current.phase).toBe('idle')
    })

    it('更新が無ければ checkedUpToDate は true（最新である旨を出す）', async () => {
      const hook = renderUpdate()

      await runCheck(hook)

      expect(hook.current.checkedUpToDate).toBe(true)
    })

    it('失敗したら error になり、メッセージを持つ', async () => {
      mockCheck.mockRejectedValue(new Error('network error'))
      const hook = renderUpdate()

      await runCheck(hook)

      expect(hook.current).toMatchObject({ phase: 'error', error: '確認に失敗しました' })
    })

    it('失敗したら checkedUpToDate は false', async () => {
      mockCheck.mockRejectedValue(new Error('network error'))
      const hook = renderUpdate()

      await runCheck(hook)

      expect(hook.current.checkedUpToDate).toBe(false)
    })

    it('前回のエラーを消してから確認する', async () => {
      mockCheck.mockRejectedValueOnce(new Error('network error'))
      const hook = renderUpdate()
      await runCheck(hook)

      await runCheck(hook)

      expect(hook.current.error).toBeNull()
    })

    it('確認中は checking が true', async () => {
      const hook = renderUpdate()

      act(() => { void hook.current.check() })

      expect(hook.current.checking).toBe(true)
    })

    it('すぐ終わっても 600ms までは checking を保つ', async () => {
      const hook = renderUpdate()
      act(() => { void hook.current.check() })

      await act(async () => { await vi.advanceTimersByTimeAsync(599) })

      expect(hook.current.checking).toBe(true)
    })

    it('600ms 経てば checking を下ろす', async () => {
      const hook = renderUpdate()
      act(() => { void hook.current.check() })

      await act(async () => { await vi.advanceTimersByTimeAsync(600) })

      expect(hook.current.checking).toBe(false)
    })

    it('失敗しても checking を下ろす', async () => {
      mockCheck.mockRejectedValue(new Error('network error'))
      const hook = renderUpdate()

      await runCheck(hook)

      expect(hook.current.checking).toBe(false)
    })
  })

  describe('dismiss', () => {
    it('表示中のバージョンを見送りとして記録する', () => {
      const hook = renderUpdate()
      act(() => handlers.available!(info))

      act(() => hook.current.dismiss())

      expect(mockDismiss).toHaveBeenCalledWith('1.1.0')
    })

    it('idle に戻す', () => {
      const hook = renderUpdate()
      act(() => handlers.available!(info))

      act(() => hook.current.dismiss())

      expect(hook.current.phase).toBe('idle')
    })

    it('更新情報が無ければ何も記録しない', () => {
      const hook = renderUpdate()

      act(() => hook.current.dismiss())

      expect(mockDismiss).not.toHaveBeenCalled()
    })
  })

  describe('install', () => {
    it('タイマーが止まっていれば、確認なしでインストールを始める', async () => {
      const confirm = vi.spyOn(window, 'confirm')
      const hook = renderUpdate()

      await runInstall(hook)

      expect(mockInstall).toHaveBeenCalledOnce()
      expect(confirm).not.toHaveBeenCalled()
    })

    it('downloading になり、percent を 0 に戻す', async () => {
      const hook = renderUpdate()
      act(() => handlers.progress!({ percent: 70, done: false }))

      await runInstall(hook)

      expect(hook.current).toMatchObject({ phase: 'downloading', percent: 0 })
    })

    it('「最新です」の表示を消す', async () => {
      const hook = renderUpdate()
      await runCheck(hook)

      await runInstall(hook)

      expect(hook.current.checkedUpToDate).toBe(false)
    })

    it('承認したバージョンでインストールを始める', async () => {
      const hook = renderUpdate()
      act(() => handlers.available!(info))

      await runInstall(hook)

      expect(mockInstall).toHaveBeenCalledWith('1.1.0')
    })

    describe('タイマー稼働中', () => {
      async function pressInstallWhileRunning(hook: Hook): Promise<void> {
        mockIsRunning.mockResolvedValue(true)
        act(() => handlers.available!(info))
        await runInstall(hook)
      }

      it('更新を押すと、アプリ内の確認ダイアログを出す', async () => {
        const hook = renderUpdate()

        await pressInstallWhileRunning(hook)

        expect(hook.current.confirmingInstall).toBe(true)
      })

      it('window.confirm は呼ばない', async () => {
        const confirm = vi.spyOn(window, 'confirm')
        const hook = renderUpdate()

        await pressInstallWhileRunning(hook)

        expect(confirm).not.toHaveBeenCalled()
      })

      it('確認が済むまでインストールしない', async () => {
        const hook = renderUpdate()

        await pressInstallWhileRunning(hook)

        expect(mockInstall).not.toHaveBeenCalled()
      })

      it('承認すると、承認したバージョンでインストールする', async () => {
        const hook = renderUpdate()
        await pressInstallWhileRunning(hook)

        await act(async () => { hook.current.confirmInstall() })

        expect(mockInstall).toHaveBeenCalledWith('1.1.0')
      })

      it('承認すると、確認ダイアログを閉じる', async () => {
        const hook = renderUpdate()
        await pressInstallWhileRunning(hook)

        await act(async () => { hook.current.confirmInstall() })

        expect(hook.current.confirmingInstall).toBe(false)
      })

      it('取り消すと、インストールしない', async () => {
        const hook = renderUpdate()
        await pressInstallWhileRunning(hook)

        await act(async () => { hook.current.cancelInstall() })

        expect(mockInstall).not.toHaveBeenCalled()
      })

      it('取り消すと、確認ダイアログを閉じる', async () => {
        const hook = renderUpdate()
        await pressInstallWhileRunning(hook)

        await act(async () => { hook.current.cancelInstall() })

        expect(hook.current.confirmingInstall).toBe(false)
      })
    })

    it('稼働中かを確かめられなければ、止まっているものとして進める', async () => {
      mockIsRunning.mockRejectedValue(new Error('ipc error'))
      const hook = renderUpdate()

      await runInstall(hook)

      expect(mockInstall).toHaveBeenCalledOnce()
    })

    it('インストールに失敗したら error になり、メッセージを持つ', async () => {
      mockInstall.mockRejectedValue(new Error('boom'))
      const hook = renderUpdate()

      await runInstall(hook)

      expect(hook.current).toMatchObject({ phase: 'error', error: '更新に失敗しました' })
    })
  })
})
