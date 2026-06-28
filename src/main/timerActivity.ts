// タイマーの稼働状態を main 側で保持する。renderer（複数ウィンドウ）から
// timer:isRunning で問い合わせ、再起動前の確認文言の切り替えに使う。
let running = false

export function setTimerRunning(value: boolean): void {
  running = value
}

export function isTimerRunning(): boolean {
  return running
}
