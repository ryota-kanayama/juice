// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { signState, verifyState } from './stateSign'

const SECRET = 'test-secret'
const NONCE = 'a'.repeat(32)

describe('signState / verifyState', () => {
  it('署名した state を検証すると元の nonce が返る', () => {
    const signed = signState(NONCE, SECRET, 1000)
    expect(verifyState(signed, SECRET, 1000)).toBe(NONCE)
  })

  it('署名に使った state は raw nonce とは異なる', () => {
    const signed = signState(NONCE, SECRET, 1000)
    expect(signed).not.toBe(NONCE)
    expect(signed.split('.')).toHaveLength(2)
  })

  it('別の secret では検証に失敗する（署名不一致）', () => {
    const signed = signState(NONCE, SECRET, 1000)
    expect(verifyState(signed, 'other-secret', 1000)).toBeNull()
  })

  it('改竄された payload は検証に失敗する', () => {
    const signed = signState(NONCE, SECRET, 1000)
    const [, sig] = signed.split('.')
    const forged = Buffer.from('evil.1000').toString('base64url') + '.' + sig
    expect(verifyState(forged, SECRET, 1000)).toBeNull()
  })

  it('TTL（10分）を超えると失効する', () => {
    const signed = signState(NONCE, SECRET, 1000)
    expect(verifyState(signed, SECRET, 1000 + 10 * 60)).toBe(NONCE) // 境界は有効
    expect(verifyState(signed, SECRET, 1000 + 10 * 60 + 1)).toBeNull()
  })

  it('未来すぎる発行時刻（時計ずれ60秒超）は弾く', () => {
    const signed = signState(NONCE, SECRET, 2000)
    expect(verifyState(signed, SECRET, 2000 - 61)).toBeNull()
  })

  it('形式不正（ドット数違い・非base64url）は null', () => {
    expect(verifyState('only-one-part', SECRET, 1000)).toBeNull()
    expect(verifyState('a.b.c', SECRET, 1000)).toBeNull()
  })
})
