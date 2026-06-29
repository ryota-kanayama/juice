import { renderHook } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useClearFocusOnShow } from './useClearFocusOnShow'

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useClearFocusOnShow', () => {
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

  it('visibilitychange の後に復元されたフォーカスも次フレームでクリアする', () => {
    const raf: { cb: FrameRequestCallback | null } = { cb: null }
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf.cb = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      raf.cb = null
    })

    const button = document.createElement('button')
    document.body.appendChild(button)

    renderHook(() => useClearFocusOnShow())
    setVisibility('visible')

    // visibilitychange の後に Chromium がフォーカスを復元するケースを再現
    button.focus()
    expect(document.activeElement).toBe(button)

    raf.cb?.(0)
    expect(document.activeElement).not.toBe(button)
  })

  it('アンマウント後はリスナーが解除される', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)

    const { unmount } = renderHook(() => useClearFocusOnShow())
    unmount()

    button.focus()
    setVisibility('visible')

    expect(document.activeElement).toBe(button)
  })
})
