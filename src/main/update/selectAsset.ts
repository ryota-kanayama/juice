export interface ReleaseAsset {
  name: string
  url: string
}

/**
 * 実行アーキテクチャに合う DMG アセットを選ぶ。
 * arm64 → "-arm64.dmg" で終わるもの。x64 → ".dmg" で終わり "-arm64.dmg" でないもの。
 */
export function selectDmgAsset(assets: ReleaseAsset[], arch: string): ReleaseAsset | null {
  if (arch === 'arm64') {
    return assets.find(a => a.name.endsWith('-arm64.dmg')) ?? null
  }
  return assets.find(a => a.name.endsWith('.dmg') && !a.name.endsWith('-arm64.dmg')) ?? null
}
