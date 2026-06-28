/** 先頭の v/V と前後空白を除いた semver 文字列を返す */
export function normalizeVersion(v: string): string {
  return v.trim().replace(/^[vV]/, '')
}

/** major.minor.patch を数値で比較。a<b→-1, a==b→0, a>b→1。桁の欠落は 0 扱い */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = normalizeVersion(b).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

/** candidate が current より新しければ true */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}
