import { renderHook } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { useClearFocusOnShow } from './useClearFocusOnShow'

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

// requestAnimationFrame をキュー化し、flushFrames で手動実行する（nested rAF も拾う）
let rafQueue: FrameRequestCallback[] = []
function flushFrames(times = 5): void {
  for (let i = 0; i < times; i++) {
    const current = rafQueue
    rafQueue = []
    current.forEach(cb => cb(0))
  }
}

describe('useClearFocusOnShow', () => {
  beforeEach(() => {
    rafQueue = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.body.innerHTML = ''
  })

  it('表示状態（visible）になったらフォーカスをクリアする', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)

    renderHook(() => useClearFocusOnShow())
    setVisibility('visible')

    expect(document.activeElement).not.toBe(button)
  })

  it('非表示（hidden）への遷移でも復元対象を消すためフォーカスをクリアする', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()

    renderHook(() => useClearFocusOnShow())
    setVisibility('hidden')

    expect(document.activeElement).not.toBe(button)
  })

  it('ウィンドウ再フォーカス（window focus）でフォーカスをクリアする', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)

    renderHook(() => useClearFocusOnShow())
    window.dispatchEvent(new Event('focus'))

    expect(document.activeElement).not.toBe(button)
  })

  it('イベント後に当たったフォーカスも後続フレームでクリアする', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)

    renderHook(() => useClearFocusOnShow())
    window.dispatchEvent(new Event('focus'))

    // イベント後に Chromium が閉じるボタン等へフォーカスを当てるケースを再現
    button.focus()
    expect(document.activeElement).toBe(button)

    flushFrames()
    expect(document.activeElement).not.toBe(button)
  })

  it('アンマウント後はリスナーが解除される', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)

    const { unmount } = renderHook(() => useClearFocusOnShow())
    unmount()

    button.focus()
    setVisibility('visible')
    window.dispatchEvent(new Event('focus'))
    flushFrames()

    expect(document.activeElement).toBe(button)
  })
})
