import { describe, it, expect } from 'vitest'
import { normalizeVersion, compareVersions, isNewerVersion } from './version'

describe('normalizeVersion', () => {
  it.each([
    ['v1.2.3', '1.2.3'],
    ['  V1.0.0 ', '1.0.0'],
    ['1.0.0', '1.0.0'],
  ])('%s → %s（先頭の v と前後の空白を除く）', (input, expected) => {
    const version = normalizeVersion(input)

    expect(version).toBe(expected)
  })
})

describe('compareVersions', () => {
  it.each([
    ['小さい', '1.0.0', '1.1.0', -1],
    ['大きい', '1.1.0', '1.0.0', 1],
    ['同じ', '1.0.0', '1.0.0', 0],
    ['文字列順ではなく数値順で大きい（1.10.0 > 1.9.0）', '1.10.0', '1.9.0', 1],
    ['v 接頭辞と欠けた桁を吸収して同じ', 'v1.2', '1.2.0', 0],
    ['v 接頭辞があっても比べられる', '2.0.0', 'v1.9.9', 1],
  ])('%s', (_label, a, b, expected) => {
    const result = compareVersions(a, b)

    expect(result).toBe(expected)
  })
})

describe('isNewerVersion', () => {
  it.each([
    ['新しい', '1.1.0', '1.0.0', true],
    ['同じ', '1.0.0', '1.0.0', false],
    ['古い', '0.9.0', '1.0.0', false],
  ])('candidate が%sなら %s', (_label, candidate, current, expected) => {
    const result = isNewerVersion(candidate, current)

    expect(result).toBe(expected)
  })
})
