// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseSlackPostRequest, buildTeleworkMessage, postToSlack } from './slackPost'

afterEach(() => vi.unstubAllGlobals())

describe('parseSlackPostRequest', () => {
  const valid = { kind: 'telework_start', projectCode: 'ES18010', projectName: 'Juice開発' }

  it('正しいボディをパースする', () => {
    expect(parseSlackPostRequest(JSON.stringify(valid))).toEqual(valid)
    expect(
      parseSlackPostRequest(JSON.stringify({ ...valid, kind: 'telework_end' }))
    ).toEqual({ ...valid, kind: 'telework_end' })
  })

  it('不正な kind は null', () => {
    expect(parseSlackPostRequest(JSON.stringify({ ...valid, kind: 'post_anything' }))).toBeNull()
  })

  it('フィールド欠落・型不正は null', () => {
    expect(parseSlackPostRequest(JSON.stringify({ kind: 'telework_start' }))).toBeNull()
    expect(parseSlackPostRequest(JSON.stringify({ ...valid, projectCode: 1 }))).toBeNull()
  })

  it('100文字を超えるフィールドは null', () => {
    expect(
      parseSlackPostRequest(JSON.stringify({ ...valid, projectName: 'あ'.repeat(101) }))
    ).toBeNull()
  })

  it('JSON でない・オブジェクトでないボディは null', () => {
    expect(parseSlackPostRequest('not json')).toBeNull()
    expect(parseSlackPostRequest('"string"')).toBeNull()
    expect(parseSlackPostRequest('')).toBeNull()
  })
})

describe('buildTeleworkMessage', () => {
  it('開始・終了の文面を組み立てる', () => {
    expect(
      buildTeleworkMessage({ kind: 'telework_start', projectCode: 'ES1', projectName: 'PJ' })
    ).toBe('テレワークを開始します\nES1 PJ')
    expect(
      buildTeleworkMessage({ kind: 'telework_end', projectCode: 'ES1', projectName: 'PJ' })
    ).toBe('テレワークを終了します\nES1 PJ')
  })
})

describe('postToSlack', () => {
  const OPTS = { botToken: 'xoxb-test', channelId: 'C123' }

  it('chat.postMessage に bot トークンとチャンネルを渡す', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const result = await postToSlack('hello', OPTS)
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect(init.headers.Authorization).toBe('Bearer xoxb-test')
    expect(JSON.parse(init.body)).toEqual({ channel: 'C123', text: 'hello' })
  })

  it('Slack API エラーは error を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
    }))
    expect(await postToSlack('x', OPTS)).toEqual({ error: 'channel_not_found' })
  })

  it('ネットワークエラーでも throw せず error を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    expect(await postToSlack('x', OPTS)).toEqual({ error: 'network: ECONNRESET' })
  })
})
