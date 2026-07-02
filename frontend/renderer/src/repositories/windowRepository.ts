// ウィンドウ操作のデータアクセス: window.bridge（IPC）への依存をこの層に閉じ込める。

export const windowRepository = {
  /** ポップオーバーウィンドウをリサイズする */
  resize(width: number, height: number): Promise<void> {
    return window.bridge.resizeWindow(width, height)
  },
  /** ポップオーバーウィンドウを隠す */
  hide(): Promise<void> {
    return window.bridge.hideWindow()
  },
  /** 外部 URL を既定ブラウザで開く */
  openUrl(url: string): Promise<void> {
    return window.bridge.openUrl(url)
  },
}
