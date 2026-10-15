// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { issueSessionJwt, verifySessionJwt } from './sessionJwt'

const SECRET = 'test-secret'
const NOW = 1_750_000_000 // 秒
const WEEK = 7 * 24 * 60 * 60

const identity = { sub: 'U123', name: '金山', team: 'T999' }
const issue = (overrides: Partial<Parameters<typeof issueSessionJwt>[0]> = {}, secret = SECRET) =>
  issueSessionJwt({ ...identity, ...overrides }, secret, NOW)

describe('issueSessionJwt', () => {
  it('header.payload.signature の3つに分かれた形式で発行する', () => {
    const token = issue()

    expect(token.split('.')).toHaveLength(3)
  })

  it('有効期限は発行から7日', () => {
    const token = issue()

    expect(verifySessionJwt(token, SECRET, NOW)).toMatchObject({ iat: NOW, exp: NOW + WEEK })
  })
})

describe('verifySessionJwt', () => {
  it('発行したトークンを検証すると、発行時のクレームを返す', () => {
    const token = issue()

    const claims = verifySessionJwt(token, SECRET, NOW)

    expect(claims).toMatchObject(identity)
  })

  it.each([
    ['email', 'a@jsl.co.jp'],
    ['handle', 'kanayama'],
    ['picture', 'https://slack.test/a.png'],
  ] as const)('%s 付きで発行したら %s も返す', (key, value) => {
    const token = issue({ [key]: value })

    const claims = verifySessionJwt(token, SECRET, NOW)

    expect(claims?.[key]).toBe(value)
  })

  it('任意のクレームを持たない古い形式のトークンも検証できる', () => {
    const token = issue()

    const claims = verifySessionJwt(token, SECRET, NOW)

    expect([claims?.email, claims?.handle, claims?.picture]).toEqual([undefined, undefined, undefined])
  })

  describe('期限', () => {
    it('期限の1秒前までは有効', () => {
      const token = issue()

      const claims = verifySessionJwt(token, SECRET, NOW + WEEK - 1)

      expect(claims).not.toBeNull()
    })

    it('期限ちょうどで無効', () => {
      const token = issue()

      const claims = verifySessionJwt(token, SECRET, NOW + WEEK)

      expect(claims).toBeNull()
    })
  })

  describe('改ざん・不正な形式', () => {
    it('別の secret で署名されたトークンは無効', () => {
      const token = issue({}, 'other')

      const claims = verifySessionJwt(token, SECRET, NOW)

      expect(claims).toBeNull()
    })

    it('署名を差し替えたトークンは無効', () => {
      const [h, p] = issue().split('.')

      const claims = verifySessionJwt(`${h}.${p}.AAAA`, SECRET, NOW)

      expect(claims).toBeNull()
    })

    it('payload を差し替えたトークンは無効', () => {
      const [h, , s] = issue().split('.')
      const forged = Buffer.from(JSON.stringify({ sub: 'U_EVIL', exp: NOW + WEEK })).toString('base64url')

      const claims = verifySessionJwt(`${h}.${forged}.${s}`, SECRET, NOW)

      expect(claims).toBeNull()
    })

    it.each([
      ['空文字', ''],
      ['区切りが無い', 'garbage'],
      ['区切りが2つ足りない', 'a.b'],
    ])('%s なら無効', (_label, token) => {
      const claims = verifySessionJwt(token, SECRET, NOW)

      expect(claims).toBeNull()
    })

    it.each([
      ['末尾に記号', '!'],
      ['末尾にパディング', '='],
    ])('署名に base64url 以外の文字（%s）が混ざったら無効（署名の可鍛性を防ぐ）', (_label, suffix) => {
      const token = issue() + suffix

      const claims = verifySessionJwt(token, SECRET, NOW)

      expect(claims).toBeNull()
    })

    it('署名が空なら無効', () => {
      const [h, p] = issue().split('.')

      const claims = verifySessionJwt(`${h}.${p}.`, SECRET, NOW)

      expect(claims).toBeNull()
    })
  })
})
