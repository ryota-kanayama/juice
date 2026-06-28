import { describe, it, expect } from 'vitest'
import { selectDmgAsset, type ReleaseAsset } from './selectAsset'

const assets: ReleaseAsset[] = [
  { name: 'Juice-1.1.0-arm64.dmg', url: 'https://x/arm64.dmg' },
  { name: 'Juice-1.1.0-arm64.dmg.blockmap', url: 'https://x/arm64.blockmap' },
  { name: 'Juice-1.1.0.dmg', url: 'https://x/x64.dmg' },
  { name: 'Juice-1.1.0.dmg.blockmap', url: 'https://x/x64.blockmap' },
  { name: 'latest-mac.yml', url: 'https://x/yml' },
]

describe('selectDmgAsset', () => {
  it('arm64 は -arm64.dmg を選ぶ', () => {
    expect(selectDmgAsset(assets, 'arm64')?.name).toBe('Juice-1.1.0-arm64.dmg')
  })
  it('x64 は -arm64 を含まない .dmg を選ぶ', () => {
    expect(selectDmgAsset(assets, 'x64')?.name).toBe('Juice-1.1.0.dmg')
  })
  it('blockmap や yml は選ばない', () => {
    const arm = selectDmgAsset(assets, 'arm64')
    expect(arm?.name.endsWith('.dmg')).toBe(true)
  })
  it('該当アセットがなければ null', () => {
    expect(selectDmgAsset([{ name: 'foo.zip', url: 'u' }], 'arm64')).toBeNull()
  })
})
