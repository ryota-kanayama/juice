import { describe, it, expect } from 'vitest'
import { oklchToHex, contrastRatio, hexToHslTriplet } from './colorUtils'

describe('oklchToHex', () => {
  it.each([
    ['白 (L=1, C=0)', 1, 0, 0, '#ffffff'],
    ['黒 (L=0, C=0)', 0, 0, 0, '#000000'],
  ])('%s は %s', (_label, l, c, h, expected) => {
    const hex = oklchToHex(l, c, h)

    expect(hex).toBe(expected)
  })

  it('sRGB の範囲外の色も、範囲内へ丸めた hex を返す', () => {
    const hex = oklchToHex(0.6, 0.4, 150) // 高彩度の緑は sRGB の外

    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('contrastRatio', () => {
  it('白と黒は 21:1', () => {
    const ratio = contrastRatio('#ffffff', '#000000')

    expect(ratio).toBeCloseTo(21, 0)
  })

  it('同じ色は 1:1', () => {
    const ratio = contrastRatio('#808080', '#808080')

    expect(ratio).toBeCloseTo(1, 5)
  })

  it('WCAG の基準値と一致する（#767676 と白は 4.54:1）', () => {
    const ratio = contrastRatio('#767676', '#ffffff')

    expect(ratio).toBeCloseTo(4.54, 2)
  })

  it('引数の順序に依存しない', () => {
    const forward = contrastRatio('#123456', '#fafafa')

    const backward = contrastRatio('#fafafa', '#123456')

    expect(backward).toBeCloseTo(forward, 5)
  })
})

describe('hexToHslTriplet', () => {
  it.each([
    ['白', '#ffffff', '0 0% 100%'],
    ['黒', '#000000', '0 0% 0%'],
    ['赤', '#ff0000', '0 100% 50%'],
  ])('%s（%s）は "%s"', (_label, hex, expected) => {
    const triplet = hexToHslTriplet(hex)

    expect(triplet).toBe(expected)
  })

  it('shadcn 形式（スペース区切り・カンマなし）を返す', () => {
    const triplet = hexToHslTriplet('#18181b')

    expect(triplet).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/)
  })
})
