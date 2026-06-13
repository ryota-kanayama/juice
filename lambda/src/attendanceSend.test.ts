// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseAttendanceRequest, resolveUserName, postAttendance } from './attendanceSend'

afterEach(() => vi.unstubAllGlobals())

describe('parseAttendanceRequest', () => {
  it('正しいボディをパースする', () => {
    expect(parseAttendanceRequest(JSON.stringify({ text: '勤怠\n8:30 17:30 60' })))
      .toEqual({ text: '勤怠\n8:30 17:30 60' })
  })

  it('text 欠落・空・型不正・2000字超・非JSONは null', () => {
    expect(parseAttendanceRequest(JSON.stringify({}))).toBeNull()
    expect(parseAttendanceRequest(JSON.stringify({ text: '  ' }))).toBeNull()
    expect(parseAttendanceRequest(JSON.stringify({ text: 1 }))).toBeNull()
    expect(parseAttendanceRequest(JSON.stringify({ text: 'あ'.repeat(2001) }))).toBeNull()
    expect(parseAttendanceRequest('not json')).toBeNull()
  })
})

describe('resolveUserName', () => {
  const claims = { sub: 'U123', name: 'Ryota Kanayama', handle: 'kanayama' }

  it('対応表に sub があれば最優先する', () => {
    expect(resolveUserName(claims, '{"U123":"override"}')).toBe('override')
  })

  it('対応表に無ければ handle（旧ハンドル）を使う', () => {
    expect(resolveUserName(claims, '{}')).toBe('kanayama')
    expect(resolveUserName(claims, '{"U999":"other"}')).toBe('kanayama')
  })

  it('handle が無ければ氏名にフォールバックする', () => {
    expect(resolveUserName({ sub: 'U123', name: 'Ryota Kanayama' }, '{}')).toBe('Ryota Kanayama')
  })

  it('対応表が不正な JSON でも handle にフォールバックする', () => {
    expect(resolveUserName(claims, 'broken')).toBe('kanayama')
  })
})

describe('postAttendance', () => {
  const OPTS = { apiUrl: 'https://kintai.test/api/receive_slack_post', apiKey: 'KEY1' }

  it('勤怠 API に form POST し status と body を透過する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: () => Promise.resolve('{}') })
    vi.stubGlobal('fetch', fetchMock)
    const result = await postAttendance('kanayama', '勤怠テキスト', OPTS)
    expect(result).toEqual({ status: 200, body: '{}' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://kintai.test/api/receive_slack_post?key=KEY1')
    const params = new URLSearchParams(String(init.body))
    expect(params.get('user_name')).toBe('kanayama')
    expect(params.get('text')).toBe('勤怠テキスト')
  })

  it('上流の 400 もそのまま透過する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 400, text: () => Promise.resolve('{"error_message":"format"}'),
    }))
    expect(await postAttendance('a', 't', OPTS))
      .toEqual({ status: 400, body: '{"error_message":"format"}' })
  })

  it('ネットワークエラーは throw せず error を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    expect(await postAttendance('a', 't', OPTS)).toEqual({ error: 'network: ECONNRESET' })
  })
})
