// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { signState, verifyState } from './stateSign'

const SECRET = 'test-secret'
const NONCE = 'a'.repeat(32)
const ISSUED = 1000
const TTL = 10 * 60

describe('signState', () => {
  it('元の nonce とは別の「本体.署名」の形にする', () => {
    const signed = signState(NONCE, SECRET, ISSUED)

    expect(signed).not.toBe(NONCE)
    expect(signed.split('.')).toHaveLength(2)
  })
})

describe('verifyState', () => {
  it('署名した state を検証すると、元の nonce を返す', () => {
    const signed = signState(NONCE, SECRET, ISSUED)

    const nonce = verifyState(signed, SECRET, ISSUED)

    expect(nonce).toBe(NONCE)
  })

  it('別の secret では無効', () => {
    const signed = signState(NONCE, SECRET, ISSUED)

    const nonce = verifyState(signed, 'other-secret', ISSUED)

    expect(nonce).toBeNull()
  })

  it('本体を差し替えたら無効', () => {
    const [, sig] = signState(NONCE, SECRET, ISSUED).split('.')
    const forged = `${Buffer.from(`evil.${ISSUED}`).toString('base64url')}.${sig}`

    const nonce = verifyState(forged, SECRET, ISSUED)

    expect(nonce).toBeNull()
  })

  describe('期限（10分）', () => {
    it('ちょうど10分後までは有効', () => {
      const signed = signState(NONCE, SECRET, ISSUED)

      const nonce = verifyState(signed, SECRET, ISSUED + TTL)

      expect(nonce).toBe(NONCE)
    })

    it('10分を1秒でも過ぎたら無効', () => {
      const signed = signState(NONCE, SECRET, ISSUED)

      const nonce = verifyState(signed, SECRET, ISSUED + TTL + 1)

      expect(nonce).toBeNull()
    })
  })

  describe('時計のずれ（60秒まで許す）', () => {
    it('発行時刻が60秒先までなら有効', () => {
      const signed = signState(NONCE, SECRET, 2000)

      const nonce = verifyState(signed, SECRET, 2000 - 60)

      expect(nonce).toBe(NONCE)
    })

    it('発行時刻が60秒より先なら無効', () => {
      const signed = signState(NONCE, SECRET, 2000)

      const nonce = verifyState(signed, SECRET, 2000 - 61)

      expect(nonce).toBeNull()
    })
  })

  it.each([
    ['区切りが無い', 'only-one-part'],
    ['区切りが多い', 'a.b.c'],
  ])('形式が不正（%s）なら無効', (_label, signed) => {
    const nonce = verifyState(signed, SECRET, ISSUED)

    expect(nonce).toBeNull()
  })
})
