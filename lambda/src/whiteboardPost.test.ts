// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { postWhiteboard } from './whiteboardPost'

afterEach(() => vi.unstubAllGlobals())

const OPTS = { apiUrl: 'https://wb.test', apiKey: 'WBKEY' }
const EMAIL = 'kanayama@jsl.co.jp'
const ATTENDANCE_URL = 'https://wb.test/api/attendance?apiKey=WBKEY'
const MAGNET_URL = 'https://wb.test/api/magnet?apiKey=WBKEY'

type Reply = { ok: boolean; status?: number; json?: unknown }

/** fetch を、渡した順に応答するモックに差し替える */
function stubFetch(...replies: Reply[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const r of replies) fn.mockResolvedValueOnce({ ok: r.ok, status: r.status, json: async () => r.json })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** GET /api/users の応答（そのユーザーの今のマグネット） */
const currentMagnet = (name: string): Reply => ({ ok: true, json: { code: 'OK', results: [{ magnet: { name } }] } })

const formOf = (call: unknown[]) => new URLSearchParams(String((call[1] as RequestInit).body))
const jsonOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))

describe('postWhiteboard', () => {
  describe('telework（テレワーク開始）', () => {
    it('今のマグネットを確かめず、最初に出勤を打刻する', async () => {
      const fetchMock = stubFetch({ ok: true }, { ok: true })

      await postWhiteboard('telework', EMAIL, OPTS)

      expect(fetchMock.mock.calls[0][0]).toBe(ATTENDANCE_URL)
    })

    it('打刻はメールアドレスと「出勤 = true」を送る', async () => {
      const fetchMock = stubFetch({ ok: true }, { ok: true })

      await postWhiteboard('telework', EMAIL, OPTS)

      const form = formOf(fetchMock.mock.calls[0])
      expect([form.get('email'), form.get('come_to_the_office')]).toEqual([EMAIL, 'true'])
    })

    it('打刻のあとにマグネットを「テレワーク（2）」にする', async () => {
      const fetchMock = stubFetch({ ok: true }, { ok: true })

      await postWhiteboard('telework', EMAIL, OPTS)

      expect(fetchMock.mock.calls[1][0]).toBe(MAGNET_URL)
      expect(jsonOf(fetchMock.mock.calls[1])).toEqual({ magnet_id: 2, email: EMAIL })
    })

    it('両方成功したら ok を返す', async () => {
      stubFetch({ ok: true }, { ok: true })

      const result = await postWhiteboard('telework', EMAIL, OPTS)

      expect(result).toEqual({ ok: true })
    })
  })

  describe('leave（退勤）', () => {
    it('まず今のマグネットを GET で確かめる', async () => {
      const fetchMock = stubFetch(currentMagnet('出社'), { ok: true }, { ok: true })

      await postWhiteboard('leave', EMAIL, OPTS)

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe(`https://wb.test/api/users?apiKey=WBKEY&id=${encodeURIComponent(EMAIL)}`)
      expect(init.method).toBe('GET')
    })

    it('退勤でなければ「出勤 = false」を打刻する', async () => {
      const fetchMock = stubFetch(currentMagnet('出社'), { ok: true }, { ok: true })

      await postWhiteboard('leave', EMAIL, OPTS)

      expect(formOf(fetchMock.mock.calls[1]).get('come_to_the_office')).toBe('false')
    })

    it('退勤でなければマグネットを「退勤（3）」にする', async () => {
      const fetchMock = stubFetch(currentMagnet('出社'), { ok: true }, { ok: true })

      await postWhiteboard('leave', EMAIL, OPTS)

      expect(jsonOf(fetchMock.mock.calls[2]).magnet_id).toBe(3)
    })

    it('すでに退勤なら、打刻もマグネットも送らない', async () => {
      const fetchMock = stubFetch(currentMagnet('退勤'))

      await postWhiteboard('leave', EMAIL, OPTS)

      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('すでに退勤でも ok を返す', async () => {
      stubFetch(currentMagnet('退勤'))

      const result = await postWhiteboard('leave', EMAIL, OPTS)

      expect(result).toEqual({ ok: true })
    })

    it.each([
      ['今のマグネットを取れない', { ok: false, status: 500 }],
      ['ユーザーが見つからない', { ok: true, json: { code: 'OK', results: [] } }],
    ])('%s ときも、そのまま退勤を送る（フェイルセーフ）', async (_label, reply) => {
      const fetchMock = stubFetch(reply, { ok: true }, { ok: true })

      const result = await postWhiteboard('leave', EMAIL, OPTS)

      expect(result).toEqual({ ok: true })
      expect(jsonOf(fetchMock.mock.calls[2]).magnet_id).toBe(3)
    })
  })

  describe('失敗したとき（例外は投げず error を返す）', () => {
    it('打刻に失敗したら attendance のエラー', async () => {
      stubFetch({ ok: false, status: 502 })

      const result = await postWhiteboard('telework', EMAIL, OPTS)

      expect(result).toEqual({ error: 'attendance: 502' })
    })

    it('打刻に失敗したらマグネットは動かさない', async () => {
      const fetchMock = stubFetch({ ok: false, status: 502 })

      await postWhiteboard('telework', EMAIL, OPTS)

      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('マグネットの更新に失敗したら magnet のエラー', async () => {
      stubFetch({ ok: true }, { ok: false, status: 500 })

      const result = await postWhiteboard('telework', EMAIL, OPTS)

      expect(result).toEqual({ error: 'magnet: 500' })
    })

    it('通信に失敗したら network のエラー', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))

      const result = await postWhiteboard('telework', EMAIL, OPTS)

      expect(result).toEqual({ error: 'network: ETIMEDOUT' })
    })
  })
})
