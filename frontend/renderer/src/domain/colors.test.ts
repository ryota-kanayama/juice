import { describe, it, expect, vi, afterEach } from 'vitest'
import { JUICE_COLOR_KEYS, randomColor, resolveJuiceColor } from './colors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('JUICE_COLOR_KEYS', () => {
  it('キーに重複が無い', () => {
    const unique = new Set(JUICE_COLOR_KEYS)

    expect(unique.size).toBe(JUICE_COLOR_KEYS.length)
  })
})

describe('randomColor', () => {
  it('乱数が最小（0）なら先頭のキーを返す', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const color = randomColor()

    expect(color).toBe(JUICE_COLOR_KEYS[0])
  })

  it('乱数が最大（1 未満）なら末尾のキーを返す（範囲外を返さない）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999)

    const color = randomColor()

    expect(color).toBe(JUICE_COLOR_KEYS[JUICE_COLOR_KEYS.length - 1])
  })
})

describe('resolveJuiceColor', () => {
  it('キーは CSS 変数参照になる', () => {
    const color = resolveJuiceColor('strawberry')

    expect(color).toBe('var(--juice-strawberry)')
  })

  it('hex（旧データ）はそのまま返す', () => {
    const color = resolveJuiceColor('#FF6B6B')

    expect(color).toBe('#FF6B6B')
  })

  it('不明なキーは先頭キーの CSS 変数になる', () => {
    const color = resolveJuiceColor('unknown-key')

    expect(color).toBe(`var(--juice-${JUICE_COLOR_KEYS[0]})`)
  })
})
