// src/main/update/downloadFile.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFile, rm, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { downloadFile } from './downloadFile'

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'juice-dl-'))
  return join(dir, 'out.bin')
}

// content-length 付き・2チャンクを返す fake fetch
function fakeFetch(chunks: Uint8Array[], total: number, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? String(total) : null) },
    body: (async function* () { for (const c of chunks) yield c })(),
  })) as unknown as typeof fetch
}

afterEach(() => vi.restoreAllMocks())

describe('downloadFile', () => {
  it('body をファイルに書き、進捗を 100 まで通知する', async () => {
    const dest = await tmpFile()
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
    const onProgress = vi.fn()
    await downloadFile('https://x/file', dest, onProgress, fakeFetch(chunks, 4))
    const written = await readFile(dest)
    expect(Array.from(written)).toEqual([1, 2, 3, 4])
    expect(onProgress).toHaveBeenLastCalledWith(100)
    await rm(dest, { force: true })
  })

  it('レスポンスが ok でなければ例外', async () => {
    const dest = await tmpFile()
    await expect(
      downloadFile('https://x/file', dest, () => {}, fakeFetch([], 0, false)),
    ).rejects.toThrow()
  })
})
