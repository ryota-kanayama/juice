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
  it('telework は magnet=2 と出勤=true を順に送る', async () => {
    const fetchMock = mockFetchSequence([{ ok: true }, { ok: true }])
    const result = await postWhiteboard('telework', EMAIL, OPTS)
    expect(result).toEqual({ ok: true })
    const [magnetUrl, magnetInit] = fetchMock.mock.calls[0]
    expect(magnetUrl).toBe('https://wb.test/api/magnet?apiKey=WBKEY')
    expect(JSON.parse(magnetInit.body)).toEqual({ magnet_id: 2, email: EMAIL })
    const [attUrl, attInit] = fetchMock.mock.calls[1]
    expect(attUrl).toBe('https://wb.test/api/attendance?apiKey=WBKEY')
    const params = new URLSearchParams(String(attInit.body))
    expect(params.get('come_to_the_office')).toBe('true')
    expect(params.get('email')).toBe(EMAIL)
  })

  it('leave は magnet=3 と出勤=false を送る', async () => {
    const fetchMock = mockFetchSequence([{ ok: true }, { ok: true }])
    await postWhiteboard('leave', EMAIL, OPTS)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).magnet_id).toBe(3)
    expect(
      new URLSearchParams(String(fetchMock.mock.calls[1][1].body)).get('come_to_the_office')
    ).toBe('false')
  })

  it('magnet 失敗時は attendance を呼ばず error を返す', async () => {
    const fetchMock = mockFetchSequence([{ ok: false, status: 500 }])
    const result = await postWhiteboard('telework', EMAIL, OPTS)
    expect(result).toEqual({ error: 'magnet: 500' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('attendance 失敗は error を返す', async () => {
    mockFetchSequence([{ ok: true }, { ok: false, status: 502 }])
    expect(await postWhiteboard('telework', EMAIL, OPTS)).toEqual({ error: 'attendance: 502' })
  })

  it('ネットワークエラーでも throw しない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    expect(await postWhiteboard('telework', EMAIL, OPTS)).toEqual({ error: 'network: ETIMEDOUT' })
  })
})
