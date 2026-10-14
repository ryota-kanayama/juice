// テスト用のデータ生成。
// 既定値はどのテストにも依存しない中立な値にしてある。テストの結果を左右する値は、
// 読み手が既定値を探しに来なくて済むよう、各テストで overrides として明示すること。
import type { Session, TimeInterval } from '../types/session'

/** 完了区間（end あり）または稼働中の区間（end = null）を作る。 */
export function interval(startTime: string, endTime: string | null): TimeInterval {
  return { startTime, endTime }
}

/** 2026-05-20 10:00〜10:30 の30分の作業を既定値とするセッションを作る。 */
export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    taskId: 't1',
    name: '作業A',
    projectCode: 'P001',
    workCategory: '開発',
    times: [interval('2026-05-20T10:00:00', '2026-05-20T10:30:00')],
    date: '2026-05-20',
    color: '#FF9500',
    totalTime: 30,
    ...overrides,
  }
}
