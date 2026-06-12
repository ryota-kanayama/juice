import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SessionClaims {
  sub: string
  name: string
  team: string
  iat: number
  exp: number
}

const EXPIRES_IN_SEC = 90 * 24 * 60 * 60 // 90日

const nowSec = (): number => Math.floor(Date.now() / 1000)

function hmac(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest()
}

/** HS256 のセッション JWT を発行する */
export function issueSessionJwt(
  identity: { sub: string; name: string; team: string },
  secret: string,
  now: number = nowSec()
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const claims: SessionClaims = { ...identity, iat: now, exp: now + EXPIRES_IN_SEC }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = hmac(`${header}.${payload}`, secret).toString('base64url')
  return `${header}.${payload}.${signature}`
}

/** セッション JWT を検証する。署名不一致・期限切れ・形式不正は null */
export function verifySessionJwt(
  token: string,
  secret: string,
  now: number = nowSec()
): SessionClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  if (!parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null
  const expected = hmac(`${parts[0]}.${parts[1]}`, secret)
  const actual = Buffer.from(parts[2], 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  let claims: SessionClaims
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
  } catch {
    return null
  }
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null
  return claims
}
