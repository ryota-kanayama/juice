// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { issueSessionJwt, verifySessionJwt } from './sessionJwt'

const SECRET = 'test-secret'
const NOW = 1_750_000_000 // 秒

describe('sessionJwt', () => {
  it('発行したトークンを検証でき、claims が一致する', () => {
    const token = issueSessionJwt({ sub: 'U123', name: '金山', team: 'T999' }, SECRET, NOW)
    const claims = verifySessionJwt(token, SECRET, NOW)
    expect(claims).toMatchObject({ sub: 'U123', name: '金山', team: 'T999', iat: NOW })
    expect(claims!.exp).toBe(NOW + 90 * 24 * 60 * 60)
  })

  it('JWT 形式（header.payload.signature）である', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, SECRET, NOW)
    expect(token.split('.')).toHaveLength(3)
  })

  it('署名が改竄されたトークンは null', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, SECRET, NOW)
    const [h, p] = token.split('.')
    expect(verifySessionJwt(`${h}.${p}.AAAA`, SECRET, NOW)).toBeNull()
  })

  it('payload が改竄されたトークンは null', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, SECRET, NOW)
    const [h, , s] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'U_EVIL' })).toString('base64url')
    expect(verifySessionJwt(`${h}.${forged}.${s}`, SECRET, NOW)).toBeNull()
  })

  it('別の secret で署名されたトークンは null', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, 'other', NOW)
    expect(verifySessionJwt(token, SECRET, NOW)).toBeNull()
  })

  it('期限切れトークンは null', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, SECRET, NOW)
    const after = NOW + 90 * 24 * 60 * 60 + 1
    expect(verifySessionJwt(token, SECRET, after)).toBeNull()
  })

  it('JWT 形式でない文字列は null', () => {
    expect(verifySessionJwt('garbage', SECRET, NOW)).toBeNull()
    expect(verifySessionJwt('', SECRET, NOW)).toBeNull()
  })

  it('署名に base64url 外の文字が混入したトークンは null（可鍛性防止）', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, SECRET, NOW)
    expect(verifySessionJwt(`${token}!`, SECRET, NOW)).toBeNull()
    expect(verifySessionJwt(`${token}=`, SECRET, NOW)).toBeNull()
  })

  it('署名パートが空のトークンは null', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, SECRET, NOW)
    const [h, p] = token.split('.')
    expect(verifySessionJwt(`${h}.${p}.`, SECRET, NOW)).toBeNull()
  })

  it('email 付きで発行したトークンは email を返す', () => {
    const token = issueSessionJwt(
      { sub: 'U1', name: 'a', team: 'T1', email: 'a@jsl.co.jp' }, SECRET, NOW
    )
    expect(verifySessionJwt(token, SECRET, NOW)!.email).toBe('a@jsl.co.jp')
  })

  it('email 無しで発行した旧形式トークンも検証できる（email は undefined）', () => {
    const token = issueSessionJwt({ sub: 'U1', name: 'a', team: 'T1' }, SECRET, NOW)
    const claims = verifySessionJwt(token, SECRET, NOW)
    expect(claims).not.toBeNull()
    expect(claims!.email).toBeUndefined()
  })
})
