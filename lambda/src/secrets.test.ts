// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class { send = mockSend },
  GetParametersCommand: class { constructor(public input: unknown) {} },
}))

import { loadSecrets, _resetForTest } from './secrets'

const PREFIX = '/juice-proxy/'
const NAMES = ['SLACK_CLIENT_SECRET', 'SESSION_SECRET', 'ATTENDANCE_API_KEY', 'WHITEBOARD_API_KEY']
const PARAMS = [
  { Name: `${PREFIX}SLACK_CLIENT_SECRET`, Value: 'cs' },
  { Name: `${PREFIX}SESSION_SECRET`, Value: 'ss' },
  { Name: `${PREFIX}ATTENDANCE_API_KEY`, Value: 'ak' },
  { Name: `${PREFIX}WHITEBOARD_API_KEY`, Value: 'wk' },
]

beforeEach(() => {
  _resetForTest()
  mockSend.mockReset().mockResolvedValue({ Parameters: PARAMS })
  process.env.SSM_SECRET_PREFIX = PREFIX
})

afterEach(() => {
  delete process.env.SSM_SECRET_PREFIX
})

describe('loadSecrets', () => {
  it('SSM から4つの秘密を取り出す', async () => {
    const secrets = await loadSecrets()

    expect(secrets).toEqual({ SLACK_CLIENT_SECRET: 'cs', SESSION_SECRET: 'ss', ATTENDANCE_API_KEY: 'ak', WHITEBOARD_API_KEY: 'wk' })
  })

  it('接頭辞を付けた4つの名前を、復号付きで要求する', async () => {
    await loadSecrets()

    const { input } = mockSend.mock.calls[0][0]
    expect(input.WithDecryption).toBe(true)
    expect([...input.Names].sort()).toEqual(NAMES.map(n => `${PREFIX}${n}`).sort())
  })

  it('同じコンテナでは2回目以降 SSM を呼ばない（キャッシュする）', async () => {
    await loadSecrets()

    await loadSecrets()

    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('取れなかった秘密があれば、その名前を添えて例外にする', async () => {
    mockSend.mockResolvedValue({ Parameters: PARAMS.slice(0, 3) })

    const loading = loadSecrets()

    await expect(loading).rejects.toThrow('WHITEBOARD_API_KEY')
  })

  it('SSM_SECRET_PREFIX が無ければ例外にする', async () => {
    delete process.env.SSM_SECRET_PREFIX

    const loading = loadSecrets()

    await expect(loading).rejects.toThrow('SSM_SECRET_PREFIX')
  })
})
