// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class { send = mockSend },
  GetItemCommand: class { constructor(public input: unknown) {} },
}))

import { getRevokedBefore, isRevoked, _resetForTest } from './revocations'

const revokedBefore = (n: number) => ({ Item: { revokedBefore: { N: String(n) } } })

beforeEach(() => {
  _resetForTest()
  mockSend.mockReset()
  process.env.REVOCATION_TABLE = 'juice-revocations'
})

afterEach(() => {
  delete process.env.REVOCATION_TABLE
})

describe('getRevokedBefore', () => {
  it('ユーザーの失効時刻を数値で返す', async () => {
    mockSend.mockResolvedValue(revokedBefore(1000))

    const result = await getRevokedBefore('U1')

    expect(result).toBe(1000)
  })

  it('そのユーザーをキーにして、設定されたテーブルを引く', async () => {
    mockSend.mockResolvedValue({})

    await getRevokedBefore('U1')

    expect(mockSend.mock.calls[0][0].input).toMatchObject({ TableName: 'juice-revocations', Key: { sub: { S: 'U1' } } })
  })

  it('記録が無ければ null', async () => {
    mockSend.mockResolvedValue({})

    const result = await getRevokedBefore('U1')

    expect(result).toBeNull()
  })

  it('テーブルが設定されていなければ null（失効機能オフ）', async () => {
    delete process.env.REVOCATION_TABLE

    const result = await getRevokedBefore('U1')

    expect(result).toBeNull()
  })

  it('テーブルが設定されていなければ DynamoDB を呼ばない', async () => {
    delete process.env.REVOCATION_TABLE

    await getRevokedBefore('U1')

    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('isRevoked', () => {
  it.each([
    ['失効時刻より前に発行されたトークンは失効', 999, true],
    ['失効時刻ちょうどに発行されたトークンは有効', 1000, false],
    ['失効時刻より後に発行されたトークンは有効', 1001, false],
  ])('%s', async (_label, iat, expected) => {
    mockSend.mockResolvedValue(revokedBefore(1000))

    const revoked = await isRevoked('U1', iat)

    expect(revoked).toBe(expected)
  })

  it('失効の記録が無ければ有効', async () => {
    mockSend.mockResolvedValue({})

    const revoked = await isRevoked('U1', 1)

    expect(revoked).toBe(false)
  })
})
