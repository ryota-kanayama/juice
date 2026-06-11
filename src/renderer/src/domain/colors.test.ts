import { describe, it, expect } from 'vitest'
import { JUICE_COLOR_KEYS, randomColor, resolveJuiceColor } from './colors'

describe('JUICE_COLOR_KEYS', () => {
  it('10キーある', () => {
    expect(JUICE_COLOR_KEYS).toHaveLength(10)
  })
})

describe('randomColor', () => {
  it('キーのいずれかを返す', () => {
    for (let i = 0; i < 50; i++) {
      expect(JUICE_COLOR_KEYS).toContain(randomColor())
    }
  })
})

describe('resolveJuiceColor', () => {
  it('キーは CSS 変数参照になる', () => {
    expect(resolveJuiceColor('strawberry')).toBe('var(--juice-strawberry)')
  })

  it('hex（既存データ）はそのまま返す（後方互換）', () => {
    expect(resolveJuiceColor('#FF6B6B')).toBe('#FF6B6B')
  })

  it('不明なキーはフォールバック色の CSS 変数になる', () => {
    expect(resolveJuiceColor('unknown-key')).toBe('var(--juice-peach)')
  })
})
