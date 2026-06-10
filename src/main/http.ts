import { net } from 'electron'

export interface HttpResult {
  ok: boolean
  status: number
  body: string
}

/** POST リクエストを送信する。ネットワークエラー時も reject せず status:0 で resolve する */
export function httpPost(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<HttpResult> {
  return new Promise<HttpResult>((resolve) => {
    const request = net.request({ method: 'POST', url })
    for (const [key, value] of Object.entries(headers)) request.setHeader(key, value)
    request.on('response', (response) => {
      let resBody = ''
      response.on('data', (chunk) => { resBody += chunk.toString() })
      response.on('end', () => {
        const ok = response.statusCode >= 200 && response.statusCode < 300
        resolve({ ok, status: response.statusCode, body: resBody })
      })
    })
    request.on('error', (err) => {
      resolve({ ok: false, status: 0, body: err.message })
    })
    request.write(body)
    request.end()
  })
}
