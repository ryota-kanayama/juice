/**
 * 外部 API 呼び出しのタイムアウト（ms）。
 * Lambda 自体の timeout（10s）より十分短く設定し、ハングした接続が
 * 同時実行枠を占有し続けて他リクエストをスロットルさせるのを防ぐ。
 * /auth/callback は Slack を2回逐次呼ぶため、2回分でも 10s を割らない値にする。
 */
export const FETCH_TIMEOUT_MS = 4000
