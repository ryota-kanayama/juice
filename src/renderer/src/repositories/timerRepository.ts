// タイマー通知シグナルのデータアクセス: メインプロセスへの IPC をこの層に閉じ込める。
// メインプロセスはこのシグナルでアイドル/経過時間通知を制御する。

export const timerRepository = {
  /** タイマー開始をメインプロセスに通知する */
  started(): Promise<void> {
    return window.electronAPI.timerStarted()
  },
  /** タイマー停止をメインプロセスに通知する */
  stopped(): Promise<void> {
    return window.electronAPI.timerStopped()
  },
  /** タイマー開始時刻の変更をメインプロセスに通知する */
  adjustStartTime(newStartMs: number): Promise<void> {
    return window.electronAPI.timerAdjustStartTime(newStartMs)
  },
}
