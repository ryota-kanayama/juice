import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm'

// 秘密値は環境変数や tfstate に置かず、SSM Parameter Store(SecureString) から
// 起動時(コールド時)に取得してキャッシュする。パラメータは Terraform 管理外
// （CLI で投入）で、Lambda は名前のプレフィックスだけを env から知る。

export interface Secrets {
  SLACK_CLIENT_SECRET: string
  SESSION_SECRET: string
  ATTENDANCE_API_KEY: string
  WHITEBOARD_API_KEY: string
}

const SECRET_KEYS: (keyof Secrets)[] = [
  'SLACK_CLIENT_SECRET',
  'SESSION_SECRET',
  'ATTENDANCE_API_KEY',
  'WHITEBOARD_API_KEY',
]

let cached: Secrets | null = null
let client: SSMClient | null = null

/** SSM から秘密値を取得する（同一コンテナ内ではキャッシュを再利用）。 */
export async function loadSecrets(): Promise<Secrets> {
  if (cached) return cached

  const prefix = process.env.SSM_SECRET_PREFIX
  if (!prefix) throw new Error('環境変数 SSM_SECRET_PREFIX が未設定')

  client ??= new SSMClient({})
  const names = SECRET_KEYS.map(k => `${prefix}${k}`)
  const res = await client.send(new GetParametersCommand({ Names: names, WithDecryption: true }))

  const byName = new Map((res.Parameters ?? []).map(p => [p.Name, p.Value]))
  const out = {} as Secrets
  for (const k of SECRET_KEYS) {
    const value = byName.get(`${prefix}${k}`)
    if (!value) throw new Error(`SSM パラメータが取得できません: ${prefix}${k}`)
    out[k] = value
  }
  cached = out
  return out
}

/** テスト用: キャッシュをリセットする。 */
export function _resetForTest(): void {
  cached = null
  client = null
}
