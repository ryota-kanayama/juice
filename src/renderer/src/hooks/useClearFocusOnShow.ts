import { useEffect } from 'react'

/**
 * ポップオーバーのウィンドウは初回に生成したあと hide/show で使い回される。
 * 再表示・再フォーカス時に Chromium が前回フォーカスしていた要素や最初のフォーカス
 * 可能要素（× 閉じるボタンなど）へフォーカスを当てるため、開いた瞬間にフォーカス
 * リングが残ってしまう。
 *
 * 次のタイミングでフォーカスをクリアして「開いた直後はどこにもフォーカスしない」
 * 状態にする。
 * - visibilitychange: hide/show のたび。非表示時に外しておくと復元レースを断てる。
 * - window focus: 他アプリから戻ってウィンドウが再フォーカスされたとき。
 *   `win.focus()` による初期フォーカス付与は visibilitychange より後に走るため、
 *   こちらでも拾う必要がある。
 *
 * いずれも同フレーム＋後続フレームでクリアし、イベント後に走るフォーカス付与も拾う。
 * 表示中に行う操作（タイマー開始やダイアログ表示）の autoFocus はこれらのイベントを
 * 発火させないため影響を受けない。
 */
export function useClearFocusOnShow(): void {
  useEffect(() => {
    let frames: number[] = []
    const blurActive = (): void => {
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body) active.blur()
    }
    const clearFocus = (): void => {
      blurActive()
      frames.forEach(cancelAnimationFrame)
      // イベント後に走るフォーカス付与に備え、続く2フレームでも消す
      const f1 = requestAnimationFrame(() => {
        blurActive()
        const f2 = requestAnimationFrame(blurActive)
        frames = [f2]
      })
      frames = [f1]
    }
    document.addEventListener('visibilitychange', clearFocus)
    window.addEventListener('focus', clearFocus)
    return () => {
      document.removeEventListener('visibilitychange', clearFocus)
      window.removeEventListener('focus', clearFocus)
      frames.forEach(cancelAnimationFrame)
    }
  }, [])
}
