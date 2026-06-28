// src/main/update/downloadFile.ts
import { createWriteStream } from 'fs'

/**
 * URL を destPath にストリーム保存する。content-length があれば進捗(0-100)を通知。
 * Electron main は global fetch（undici）を持つ。body は async-iterable。
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (percent: number) => void,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(url)
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status}`)
  }
  const total = Number(res.headers.get('content-length')) || 0
  const out = createWriteStream(destPath)
  let received = 0
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.length
      if (!out.write(chunk)) {
        await new Promise<void>(resolve => out.once('drain', resolve))
      }
      if (total > 0) onProgress(Math.round((received / total) * 100))
    }
    onProgress(100)
  } finally {
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve())),
    )
  }
}
