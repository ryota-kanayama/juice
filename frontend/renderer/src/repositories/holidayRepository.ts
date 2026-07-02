// 祝日データのデータアクセス: window.bridge（IPC）への依存をこの層に閉じ込める。

export const holidayRepository = {
  /** 祝日マップ（"YYYY-MM-DD" → 祝日名）を取得する */
  getAll(): Promise<Record<string, string>> {
    return window.bridge.getHolidays()
  },
}
