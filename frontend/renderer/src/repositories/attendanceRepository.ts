// 勤怠データアクセス: window.bridge（IPC）への依存をこの層に閉じ込める。
// 上位層（hooks / components）は IPC を直接触らない。

export const attendanceRepository = {
  /** 勤怠報告テキストを送信する */
  send(text: string): Promise<{ ok: boolean; status: number; body: string }> {
    return window.bridge.sendAttendance(text)
  },
  /** テレワーク開始をホワイトボード / Slack に通知する */
  startTelework(): Promise<void> {
    return window.bridge.teleworkStart()
  },
}
