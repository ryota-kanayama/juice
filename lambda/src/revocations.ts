import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

// JWT の個別失効。ステートレス JWT は単体で無効化できないため、
// 「ユーザー(sub)ごとの失効時刻(revokedBefore)」を DynamoDB に持ち、
// それより前に発行されたトークン(iat < revokedBefore)を拒否する。
// 退職者・紛失端末は当該 sub の revokedBefore を現在時刻にセットすれば即停止できる。

let client: DynamoDBClient | null = null

/** 当該ユーザーの失効時刻(unix秒)を返す。レコードが無ければ null。 */
export async function getRevokedBefore(sub: string): Promise<number | null> {
  const table = process.env.REVOCATION_TABLE
  // テーブル未設定なら失効機能は無効（後方互換・段階的導入のため）
  if (!table) return null

  client ??= new DynamoDBClient({})
  const res = await client.send(new GetItemCommand({
    TableName: table,
    Key: { sub: { S: sub } },
    ProjectionExpression: 'revokedBefore',
  }))
  const value = res.Item?.revokedBefore?.N
  return value ? Number(value) : null
}

/** iat(発行時刻) のトークンが失効済みか。 */
export async function isRevoked(sub: string, iat: number): Promise<boolean> {
  const revokedBefore = await getRevokedBefore(sub)
  return revokedBefore != null && iat < revokedBefore
}

/** テスト用: クライアントをリセットする。 */
export function _resetForTest(): void {
  client = null
}
