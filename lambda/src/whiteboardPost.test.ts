// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { postWhiteboard } from './whiteboardPost'

afterEach(() => vi.unstubAllGlobals())

const OPTS = { apiUrl: 'https://wb.test', apiKey: 'WBKEY' }
const EMAIL = 'kanayama@jsl.co.jp'

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json?: unknown }>
): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce({ ok: r.ok, status: r.status, json: async () => r.json })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

/** /api/users の成功レスポンス body（指定マグネット名のユーザー1件）を作る */
function usersBody(magnetName: string): unknown {
  return { code: 'OK', results: [{ magnet: { name: magnetName } }] }
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

  it('leave は 現在値を確認後に 出勤打刻=false → magnet=3 を送る', async () => {
    // 1回目: 現在値取得(GET /api/users) → 退勤以外, 2回目: 打刻, 3回目: magnet
    const fetchMock = mockFetchSequence([
      { ok: true, json: usersBody('出社') },
      { ok: true },
      { ok: true },
    ])
    const result = await postWhiteboard('leave', EMAIL, OPTS)
    expect(result).toEqual({ ok: true })
    // 1回目: 現在のマグネットを GET で取得
    const [usersUrl, usersInit] = fetchMock.mock.calls[0]
    expect(usersUrl).toBe(`https://wb.test/api/users?apiKey=WBKEY&id=${encodeURIComponent(EMAIL)}`)
    expect(usersInit.method).toBe('GET')
    // 2回目: 打刻=false
    expect(
      new URLSearchParams(String(fetchMock.mock.calls[1][1].body)).get('come_to_the_office')
    ).toBe('false')
    // 3回目: magnet=3
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).magnet_id).toBe(3)
  })

  it('leave で既に退勤なら 打刻も magnet も送らず ok を返す', async () => {
    const fetchMock = mockFetchSequence([{ ok: true, json: usersBody('退勤') }])
    const result = await postWhiteboard('leave', EMAIL, OPTS)
    expect(result).toEqual({ ok: true })
    // GET のみ。打刻・magnet の POST はしない
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leave で現在値取得が失敗しても 従来通り退勤を送る（フェイルセーフ）', async () => {
    const fetchMock = mockFetchSequence([
      { ok: false, status: 500 },
      { ok: true },
      { ok: true },
    ])
    expect(await postWhiteboard('leave', EMAIL, OPTS)).toEqual({ ok: true })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).magnet_id).toBe(3)
  })

  it('leave で対象ユーザーが見つからなくても 従来通り退勤を送る', async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { code: 'OK', results: [] } },
      { ok: true },
      { ok: true },
    ])
    expect(await postWhiteboard('leave', EMAIL, OPTS)).toEqual({ ok: true })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).magnet_id).toBe(3)
  })

  it('telework は現在値を確認せず（GET を呼ばず）打刻・magnet を送る', async () => {
    const fetchMock = mockFetchSequence([{ ok: true }, { ok: true }])
    await postWhiteboard('telework', EMAIL, OPTS)
    // 1回目が GET ではなく打刻であること（GET をスキップ）
    expect(fetchMock.mock.calls[0][0]).toBe('https://wb.test/api/attendance?apiKey=WBKEY')
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
