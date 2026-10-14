import { describe, it, expect } from 'vitest'
import { THEMES, DARK_THEMES } from './themes'
import { THEME_PARAMS } from './theme/themeParams'

const ALL = [...THEMES, ...DARK_THEMES]
const HEX = /^#[0-9a-f]{6}$/

describe('テーマのメタデータ', () => {
  it('すべてのテーマ定義を、ライトとダークのどちらかに漏れなく振り分ける', () => {
    const ids = ALL.map(t => t.id).sort()

    expect(ids).toEqual(THEME_PARAMS.map(p => p.id).sort())
  })

  it('THEMES にはライトのテーマだけを入れる', () => {
    const darkInLight = THEMES.filter(t => t.dark)

    expect(darkInLight).toEqual([])
  })

  it('DARK_THEMES のテーマはすべて dark フラグを持つ', () => {
    const notDark = DARK_THEMES.filter(t => t.dark !== true)

    expect(notDark).toEqual([])
  })

  it.each(ALL.map(t => [t.id, t] as const))('%s は見本の色（bg / accent / textPrimary）を hex で持つ', (_id, theme) => {
    const colors = [theme.bg, theme.accent, theme.textPrimary]

    expect(colors.every(c => HEX.test(c))).toBe(true)
  })

  it.each(ALL.map(t => [t.id, t] as const))('%s は絵文字を持つ', (_id, theme) => {
    expect(theme.emoji).not.toBe('')
  })

  it('グラデーションのテーマは mandarin と berry', () => {
    const gradient = THEMES.filter(t => t.gradient).map(t => t.id).sort()

    expect(gradient).toEqual(['berry', 'mandarin'])
  })
})
