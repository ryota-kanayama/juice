import { describe, it, expect, vi } from 'vitest'
import { fetchLatestRelease } from './githubRelease'

function fakeFetch(payload: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    json: async () => payload,
  })) as unknown as typeof fetch
}

describe('fetchLatestRelease', () => {
  it('GitHub API レスポンスを GithubRelease に変換する', async () => {
    const fetchFn = fakeFetch({
      tag_name: 'v1.1.0',
      html_url: 'https://github.com/ryota-kanayama/juice/releases/tag/v1.1.0',
      body: 'changelog',
      assets: [
        { name: 'Juice-1.1.0-arm64.dmg', browser_download_url: 'https://x/arm64.dmg' },
        { name: 'Juice-1.1.0.dmg', browser_download_url: 'https://x/x64.dmg' },
      ],
    })
    const release = await fetchLatestRelease(fetchFn)
    expect(release.tagName).toBe('v1.1.0')
    expect(release.htmlUrl).toContain('/releases/tag/v1.1.0')
    expect(release.body).toBe('changelog')
    expect(release.assets).toEqual([
      { name: 'Juice-1.1.0-arm64.dmg', url: 'https://x/arm64.dmg' },
      { name: 'Juice-1.1.0.dmg', url: 'https://x/x64.dmg' },
    ])
  })

  it('レスポンスが ok でなければ例外を投げる', async () => {
    const fetchFn = fakeFetch({}, false)
    await expect(fetchLatestRelease(fetchFn)).rejects.toThrow()
  })

  it('assets / body が欠けても安全に既定値を返す', async () => {
    const fetchFn = fakeFetch({ tag_name: 'v1.0.0', html_url: 'u' })
    const release = await fetchLatestRelease(fetchFn)
    expect(release.assets).toEqual([])
    expect(release.body).toBe('')
  })
})
