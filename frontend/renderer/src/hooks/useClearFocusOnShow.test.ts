import { renderHook } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { useClearFocusOnShow } from './useClearFocusOnShow'

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

// requestAnimationFrame をキュー化し、flushFrames で手動実行する（入れ子の rAF も拾う）
let rafQueue: FrameRequestCallback[] = []
function flushFrames(times = 5): void {
  for (let i = 0; i < times; i++) {
    const current = rafQueue
    rafQueue = []
    current.forEach(cb => cb(0))
  }
}

function focusedButton(): HTMLButtonElement {
  const button = document.createElement('button')
  document.body.appendChild(button)
  button.focus()
  return button
}

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

describe('useClearFocusOnShow', () => {
  it('表示状態（visible）になったらフォーカスを外す', () => {
    const button = focusedButton()
    renderHook(() => useClearFocusOnShow())

    setVisibility('visible')

    expect(document.activeElement).not.toBe(button)
  })

  it('非表示（hidden）になったときも、復元されないようフォーカスを外す', () => {
    const button = focusedButton()
    renderHook(() => useClearFocusOnShow())

    setVisibility('hidden')

    expect(document.activeElement).not.toBe(button)
  })

  it('ウィンドウが再フォーカスされたらフォーカスを外す', () => {
    const button = focusedButton()
    renderHook(() => useClearFocusOnShow())

    window.dispatchEvent(new Event('focus'))

    expect(document.activeElement).not.toBe(button)
  })

  it('イベントのあとに当たったフォーカスも、続くフレームで外す', () => {
    renderHook(() => useClearFocusOnShow())
    window.dispatchEvent(new Event('focus'))
    // イベント後に WebView が閉じるボタン等へフォーカスを当てる状況
    const button = focusedButton()

    flushFrames()

    expect(document.activeElement).not.toBe(button)
  })

  it('アンマウント後はフォーカスに触れない', () => {
    const { unmount } = renderHook(() => useClearFocusOnShow())
    unmount()
    const button = focusedButton()

    setVisibility('visible')
    window.dispatchEvent(new Event('focus'))
    flushFrames()

    expect(document.activeElement).toBe(button)
  })
})
