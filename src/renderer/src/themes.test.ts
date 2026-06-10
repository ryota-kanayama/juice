import { describe, it, expect } from 'vitest'
import { THEMES, DARK_THEMES } from './themes'

describe('テーマメタデータ', () => {
  it('ライト7 + ダーク4 である', () => {
    expect(THEMES).toHaveLength(7)
    expect(DARK_THEMES).toHaveLength(4)
  })

  it('ID が重複しない', () => {
    const ids = [...THEMES, ...DARK_THEMES].map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('各テーマは bg / accent / textPrimary / emoji を持つ', () => {
    for (const t of [...THEMES, ...DARK_THEMES]) {
      expect(t.bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/)
      expect(t.textPrimary).toMatch(/^#[0-9a-f]{6}$/)
      expect(t.emoji.length).toBeGreaterThan(0)
    }
  })

  it('DARK_THEMES はすべて dark フラグを持つ', () => {
    for (const t of DARK_THEMES) expect(t.dark).toBe(true)
  })

  it('グラデーションテーマは mandarin と berry', () => {
    expect(THEMES.filter(t => t.gradient).map(t => t.id).sort()).toEqual(['berry', 'mandarin'])
  })
})
