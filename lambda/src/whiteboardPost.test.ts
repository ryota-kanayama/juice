// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { postWhiteboard } from './whiteboardPost'

afterEach(() => vi.unstubAllGlobals())

const OPTS = { apiUrl: 'https://wb.test', apiKey: 'WBKEY' }
const EMAIL = 'kanayama@jsl.co.jp'

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number }>): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of responses) fn.mockResolvedValueOnce(r)
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('postWhiteboard', () => {
  it('telework は 出勤打刻=true → magnet=2 を順に送る', async () => {
    const fetchMock = mockFetchSequence([{ ok: true }, { ok: true }])
    const result = await postWhiteboard('telework', EMAIL, OPTS)
    expect(result).toEqual({ ok: true })
    // 1回目: 打刻（表示ステータスより先に確定させる）
    const [attUrl, attInit] = fetchMock.mock.calls[0]
    expect(attUrl).toBe('https://wb.test/api/attendance?apiKey=WBKEY')
    const params = new URLSearchParams(String(attInit.body))
    expect(params.get('come_to_the_office')).toBe('true')
    expect(params.get('email')).toBe(EMAIL)
    // 2回目: magnet（表示ステータス）
    const [magnetUrl, magnetInit] = fetchMock.mock.calls[1]
    expect(magnetUrl).toBe('https://wb.test/api/magnet?apiKey=WBKEY')
    expect(JSON.parse(magnetInit.body)).toEqual({ magnet_id: 2, email: EMAIL })
  })

  it('leave は 出勤打刻=false → magnet=3 を送る', async () => {
    const fetchMock = mockFetchSequence([{ ok: true }, { ok: true }])
    await postWhiteboard('leave', EMAIL, OPTS)
    expect(
      new URLSearchParams(String(fetchMock.mock.calls[0][1].body)).get('come_to_the_office')
    ).toBe('false')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).magnet_id).toBe(3)
  })

  it('打刻失敗時は magnet を呼ばず error を返す', async () => {
    const fetchMock = mockFetchSequence([{ ok: false, status: 502 }])
    const result = await postWhiteboard('telework', EMAIL, OPTS)
    expect(result).toEqual({ error: 'attendance: 502' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('magnet 失敗は error を返す（打刻は成功済みなので誤表示は残らない）', async () => {
    mockFetchSequence([{ ok: true }, { ok: false, status: 500 }])
    expect(await postWhiteboard('telework', EMAIL, OPTS)).toEqual({ error: 'magnet: 500' })
  })

  it('ネットワークエラーでも throw しない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    expect(await postWhiteboard('telework', EMAIL, OPTS)).toEqual({ error: 'network: ETIMEDOUT' })
  })
})
