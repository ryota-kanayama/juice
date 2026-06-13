// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class { send = mockSend },
  GetItemCommand: class { constructor(public input: unknown) {} },
}))

import { getRevokedBefore, isRevoked, _resetForTest } from './revocations'

beforeEach(() => {
  _resetForTest()
  mockSend.mockReset()
  process.env.REVOCATION_TABLE = 'juice-revocations'
})

afterEach(() => {
  delete process.env.REVOCATION_TABLE
})

describe('getRevokedBefore', () => {
  it('レコードがあれば revokedBefore を数値で返す', async () => {
    mockSend.mockResolvedValue({ Item: { revokedBefore: { N: '1000' } } })
    expect(await getRevokedBefore('U1')).toBe(1000)
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input.Key).toEqual({ sub: { S: 'U1' } })
  })

  it('レコードが無ければ null', async () => {
    mockSend.mockResolvedValue({})
    expect(await getRevokedBefore('U1')).toBeNull()
  })

  it('テーブル未設定なら DynamoDB を呼ばず null（機能オフ）', async () => {
    delete process.env.REVOCATION_TABLE
    expect(await getRevokedBefore('U1')).toBeNull()
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('isRevoked', () => {
  it('iat が revokedBefore より前なら失効', async () => {
    mockSend.mockResolvedValue({ Item: { revokedBefore: { N: '1000' } } })
    expect(await isRevoked('U1', 999)).toBe(true)
  })

  it('iat が revokedBefore 以降なら有効', async () => {
    mockSend.mockResolvedValue({ Item: { revokedBefore: { N: '1000' } } })
    expect(await isRevoked('U1', 1000)).toBe(false)
    expect(await isRevoked('U1', 1001)).toBe(false)
  })

  it('失効レコードが無ければ有効', async () => {
    mockSend.mockResolvedValue({})
    expect(await isRevoked('U1', 1)).toBe(false)
  })
})
