import { createHmac, timingSafeEqual } from 'node:crypto'

// OAuth の state を /auth/start ↔ /auth/callback で結びつけるための HMAC 署名。
// Function URL はステートレスなため、サーバ側に保存を持たずに
// 「この state は自分の /auth/start が発行したものか」「TTL 内か」を検証する。
// アプリ側の nonce 照合（signIn.ts）に対する多層防御。

const STATE_TTL_SEC = 10 * 60 // アプリ側 STATE_TTL_MS と一致させる

const nowSec = (): number => Math.floor(Date.now() / 1000)

/**
 * アプリ生成の nonce に発行時刻と HMAC 署名を付け、Slack へ渡す state を作る。
 * 形式: base64url("<nonce>.<issuedAt>").<sig>
 */
export function signState(nonce: string, secret: string, now: number = nowSec()): string {
  const payload = `${nonce}.${now}`
  const encoded = Buffer.from(payload).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${encoded}.${sig}`
}

/**
 * 署名済み state を検証し、元の nonce を返す。
 * 署名不一致・期限切れ・形式不正は null。
 */
export function verifyState(signed: string, secret: string, now: number = nowSec()): string | null {
  const parts = signed.split('.')
  if (parts.length !== 2) return null
  let payload: string
  try {
    payload = Buffer.from(parts[0], 'base64url').toString('utf-8')
  } catch {
    return null
  }
  const expected = createHmac('sha256', secret).update(payload).digest()
  const actual = Buffer.from(parts[1], 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  const sep = payload.lastIndexOf('.')
  if (sep < 0) return null
  const nonce = payload.slice(0, sep)
  const issuedAt = Number(payload.slice(sep + 1))
  if (!nonce || !Number.isFinite(issuedAt)) return null
  // 期限切れ、および未来すぎる発行時刻（時計ずれ許容60秒）を弾く
  if (now - issuedAt > STATE_TTL_SEC || issuedAt - now > 60) return null
  return nonce
}
