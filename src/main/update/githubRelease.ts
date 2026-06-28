import type { ReleaseAsset } from './selectAsset'

export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/ryota-kanayama/juice/releases/latest'

export interface GithubRelease {
  tagName: string
  htmlUrl: string
  body: string
  assets: ReleaseAsset[]
}

interface RawAsset {
  name?: string
  browser_download_url?: string
}
interface RawRelease {
  tag_name?: string
  html_url?: string
  body?: string
  assets?: RawAsset[]
}

/** GitHub の latest release を取得して正規化する。未認証・公開リポ前提 */
export async function fetchLatestRelease(fetchFn: typeof fetch = fetch): Promise<GithubRelease> {
  const res = await fetchFn(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}`)
  }
  const raw = (await res.json()) as RawRelease
  return {
    tagName: raw.tag_name ?? '',
    htmlUrl: raw.html_url ?? '',
    body: raw.body ?? '',
    assets: (raw.assets ?? [])
      .filter((a): a is Required<RawAsset> => Boolean(a.name && a.browser_download_url))
      .map(a => ({ name: a.name, url: a.browser_download_url })),
  }
}
