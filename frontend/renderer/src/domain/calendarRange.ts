// カレンダー窓の表示範囲を扱う純粋関数。
// 日付はすべてローカルタイムの "YYYY-MM-DD" 文字列で受け渡す（Date の UTC ずれを避けるため
// 文字列 → 数値 → Date(y, m-1, d) の順で組み立てる）。

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "YYYY-MM-DD" に日数を加算する（負数で減算）。月・年またぎは Date に任せる。 */
export function addDays(date: string, days: number): string {
  const d = toDate(date)
  d.setDate(d.getDate() + days)
  return toStr(d)
}

/** その日を含む週の日曜日を返す（週は日曜始まり）。 */
export function startOfWeek(date: string): string {
  return addDays(date, -toDate(date).getDay())
}

/** その週の日曜〜土曜 7 日分を返す。 */
export function weekDates(date: string): string[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/**
 * 表示期間の見出しを作る。
 * 単一月: "2026年8月" / 月またぎ: "2026年8月 – 9月" / 年またぎ: "2026年12月 – 2027年1月"
 */
export function formatPeriod(dates: string[]): string {
  if (dates.length === 0) return ''
  const first = toDate(dates[0])
  const last = toDate(dates[dates.length - 1])
  const head = `${first.getFullYear()}年${first.getMonth() + 1}月`
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return head
  }
  const tail = first.getFullYear() === last.getFullYear()
    ? `${last.getMonth() + 1}月`
    : `${last.getFullYear()}年${last.getMonth() + 1}月`
  return `${head} – ${tail}`
}
