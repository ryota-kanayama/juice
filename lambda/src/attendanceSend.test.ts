// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseAttendanceRequest, resolveUserName, postAttendance } from './attendanceSend'

afterEach(() => vi.unstubAllGlobals())

describe('parseAttendanceRequest', () => {
  it('本文の text を取り出す', () => {
    const body = JSON.stringify({ text: '勤怠\n8:30 17:30 60' })

    const request = parseAttendanceRequest(body)

    expect(request).toEqual({ text: '勤怠\n8:30 17:30 60' })
  })

  it('2000字ちょうどまでは受け付ける', () => {
    const body = JSON.stringify({ text: 'あ'.repeat(2000) })

    const request = parseAttendanceRequest(body)

    expect(request).not.toBeNull()
  })

  it.each([
    ['text が無い', JSON.stringify({})],
    ['text が空白だけ', JSON.stringify({ text: '  ' })],
    ['text が文字列でない', JSON.stringify({ text: 1 })],
    ['text が2000字を超える', JSON.stringify({ text: 'あ'.repeat(2001) })],
    ['JSON として壊れている', 'not json'],
    ['JSON の null', 'null'],
  ])('%s なら null', (_label, body) => {
    const request = parseAttendanceRequest(body)

    expect(request).toBeNull()
  })
})

describe('resolveUserName', () => {
  const claims = { sub: 'U123', name: 'Ryota Kanayama', handle: 'kanayama' }

  it('対応表に sub があれば、その名前を最優先する', () => {
    const name = resolveUserName(claims, '{"U123":"override"}')

    expect(name).toBe('override')
  })

  it.each([
    ['対応表が空', '{}'],
    ['対応表に本人がいない', '{"U999":"other"}'],
    ['対応表が JSON として壊れている', 'broken'],
  ])('%s なら Slack のハンドルを使う', (_label, overrides) => {
    const name = resolveUserName(claims, overrides)

    expect(name).toBe('kanayama')
  })

  it('ハンドルも無ければ氏名を使う', () => {
    const name = resolveUserName({ sub: 'U123', name: 'Ryota Kanayama' }, '{}')

    expect(name).toBe('Ryota Kanayama')
  })
})

describe('postAttendance', () => {
  const OPTS = { apiUrl: 'https://kintai.test/api/receive_slack_post', apiKey: 'KEY1' }

  function stubFetch(response: { ok: boolean; status: number; body: string }) {
    const fetchMock = vi.fn().mockResolvedValue({ ok: response.ok, status: response.status, text: () => Promise.resolve(response.body) })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('API キーをクエリに付けた URL へ送る', async () => {
    // 監査の指摘（#126）: キーをクエリに載せるとログに残る。現状の挙動を記録している
    const fetchMock = stubFetch({ ok: true, status: 200, body: '{}' })

    await postAttendance('kanayama', '勤怠テキスト', OPTS)

    expect(fetchMock.mock.calls[0][0]).toBe('https://kintai.test/api/receive_slack_post?key=KEY1')
  })

  it('送信者と本文をフォーム形式で送る', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, body: '{}' })

    await postAttendance('kanayama', '勤怠テキスト', OPTS)

    const params = new URLSearchParams(String(fetchMock.mock.calls[0][1].body))
    expect([params.get('user_name'), params.get('text')]).toEqual(['kanayama', '勤怠テキスト'])
  })

  it('タイムアウトを付けて送る', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, body: '{}' })

    await postAttendance('kanayama', '勤怠テキスト', OPTS)

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('成功したら ok・status・本文を返す', async () => {
    stubFetch({ ok: true, status: 200, body: '{}' })

    const result = await postAttendance('a', 't', OPTS)

    expect(result).toEqual({ ok: true, status: 200, body: '{}' })
  })

  it('上流の 2xx 以外は ok:false で返す（本文は診断用に残す）', async () => {
    stubFetch({ ok: false, status: 400, body: '{"error_message":"format"}' })

    const result = await postAttendance('a', 't', OPTS)

    expect(result).toEqual({ ok: false, status: 400, body: '{"error_message":"format"}' })
  })

  it('通信に失敗しても例外は投げず、error を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

    const result = await postAttendance('a', 't', OPTS)

    expect(result).toEqual({ error: 'network: ECONNRESET' })
  })
})
