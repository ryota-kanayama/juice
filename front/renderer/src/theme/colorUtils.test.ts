import { describe, it, expect } from 'vitest'
import { oklchToHex, contrastRatio, hexToHslTriplet } from './colorUtils'

describe('oklchToHex', () => {
  it('白 (L=1, C=0) は #ffffff になる', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff')
  })

  it('黒 (L=0, C=0) は #000000 になる', () => {
    expect(oklchToHex(0, 0, 0)).toBe('#000000')
  })

  it('sRGB 範囲外の色は安全に丸められて hex を返す', () => {
    const hex = oklchToHex(0.6, 0.4, 150) // 高彩度の緑は sRGB 外
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('contrastRatio', () => {
  it('白と黒は 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('同色は 1:1', () => {
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5)
  })

  it('引数の順序に依存しない', () => {
    expect(contrastRatio('#123456', '#fafafa')).toBeCloseTo(contrastRatio('#fafafa', '#123456'), 5)
  })
})

describe('hexToHslTriplet', () => {
  it('白は "0 0% 100%" になる', () => {
    expect(hexToHslTriplet('#ffffff')).toBe('0 0% 100%')
  })

  it('shadcn 形式（スペース区切り・カンマなし）を返す', () => {
    expect(hexToHslTriplet('#18181b')).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/)
  })
})
