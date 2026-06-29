import { useEffect } from 'react'

/**
 * ポップオーバーのウィンドウは初回に生成したあと hide/show で使い回される。
 * 再表示時に Chromium が前回フォーカスしていた要素（× 閉じるボタンなど）へ
 * フォーカスを復元するため、開いた瞬間にフォーカスリングが残ってしまう。
 *
 * 表示／非表示が切り替わるたびにフォーカスをクリアして、「開いた直後はどこにも
 * フォーカスしない」状態にする。
 * - 非表示時: 復元対象になるフォーカスを今のうちに外し、復元レースの根を断つ。
 * - 表示時: 復元が visibilitychange より後に走るケースに備え、同フレームと
 *   次フレームの両方でクリアする。
 *
 * 表示中に行う操作（タイマー開始やダイアログ表示）の autoFocus は visibilitychange を
 * 発火させないため影響を受けない。
 */
export function useClearFocusOnShow(): void {
  useEffect(() => {
    let raf = 0
    const blurActive = (): void => {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
    }
    const clearFocus = (): void => {
      blurActive()
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(blurActive)
    }
    document.addEventListener('visibilitychange', clearFocus)
    return () => {
      document.removeEventListener('visibilitychange', clearFocus)
      cancelAnimationFrame(raf)
    }
  }, [])
}
