// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class { send = mockSend },
  GetParametersCommand: class { constructor(public input: unknown) {} },
}))

import { loadSecrets, _resetForTest } from './secrets'

const PREFIX = '/juice-proxy/'
const PARAMS = [
  { Name: `${PREFIX}SLACK_CLIENT_SECRET`, Value: 'cs' },
  { Name: `${PREFIX}SESSION_SECRET`, Value: 'ss' },
  { Name: `${PREFIX}SLACK_BOT_TOKEN`, Value: 'bt' },
  { Name: `${PREFIX}ATTENDANCE_API_KEY`, Value: 'ak' },
  { Name: `${PREFIX}WHITEBOARD_API_KEY`, Value: 'wk' },
]

beforeEach(() => {
  _resetForTest()
  mockSend.mockReset()
  process.env.SSM_SECRET_PREFIX = PREFIX
})

afterEach(() => {
  delete process.env.SSM_SECRET_PREFIX
})

describe('loadSecrets', () => {
  it('SSM から5つの秘密を取得し、WithDecryption 付きで全名を要求する', async () => {
    mockSend.mockResolvedValue({ Parameters: PARAMS })
    const secrets = await loadSecrets()
    expect(secrets).toEqual({
      SLACK_CLIENT_SECRET: 'cs', SESSION_SECRET: 'ss', SLACK_BOT_TOKEN: 'bt',
      ATTENDANCE_API_KEY: 'ak', WHITEBOARD_API_KEY: 'wk',
    })
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input.WithDecryption).toBe(true)
    expect(cmd.input.Names).toContain(`${PREFIX}SESSION_SECRET`)
    expect(cmd.input.Names).toHaveLength(5)
  })

  it('同一コンテナ内ではキャッシュし、2回目は SSM を呼ばない', async () => {
    mockSend.mockResolvedValue({ Parameters: PARAMS })
    await loadSecrets()
    await loadSecrets()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('取得できないパラメータがあれば throw する', async () => {
    mockSend.mockResolvedValue({ Parameters: PARAMS.slice(0, 4) }) // WHITEBOARD_API_KEY 欠落
    await expect(loadSecrets()).rejects.toThrow('WHITEBOARD_API_KEY')
  })

  it('SSM_SECRET_PREFIX 未設定なら throw する', async () => {
    delete process.env.SSM_SECRET_PREFIX
    await expect(loadSecrets()).rejects.toThrow('SSM_SECRET_PREFIX')
  })
})
