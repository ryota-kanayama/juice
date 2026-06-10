import { describe, it, expect } from 'vitest'
import { generateThemeTokens, JUICE_KEYS } from './themeTokens'
import { findThemeParams, THEME_PARAMS } from './themeParams'

const milk = findThemeParams('milk')!
const graphite = findThemeParams('graphite')!

describe('generateThemeTokens 構造', () => {
  it('必須の CSS 変数をすべて含む', () => {
    const { cssVars } = generateThemeTokens(milk)
    const required = [
      '--bg', '--bg-card', '--bg-tag', '--bg-hover', '--border', '--border-light',
      '--text-primary', '--text-secondary', '--text-muted',
      '--accent', '--accent-secondary', '--accent-hover', '--accent-light',
      '--text-on-accent', '--glass-bg', '--glass-border',
      '--sc-background', '--sc-foreground', '--sc-card', '--sc-card-foreground',
      '--sc-popover', '--sc-popover-foreground', '--sc-primary', '--sc-primary-foreground',
      '--sc-secondary', '--sc-secondary-foreground', '--sc-muted', '--sc-muted-foreground',
      '--sc-accent', '--sc-accent-foreground', '--sc-destructive', '--sc-destructive-foreground',
      '--sc-border', '--sc-input', '--sc-ring',
    ]
    for (const key of required) {
      expect(cssVars[key], `${key} がない`).toBeDefined()
    }
  })

  it('ジュース色は10キーすべて生成される', () => {
    const { juiceColors } = generateThemeTokens(milk)
    expect(Object.keys(juiceColors).sort()).toEqual([...JUICE_KEYS].sort())
    expect(JUICE_KEYS).toHaveLength(10)
  })

  it('色トークンは hex 形式（--sc- と shadow を除く）', () => {
    const { cssVars } = generateThemeTokens(milk)
    for (const [key, value] of Object.entries(cssVars)) {
      if (key.startsWith('--sc-') || key.startsWith('--shadow')) continue
      expect(value, key).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('ライト/ダークの生成ルール', () => {
  it('ダークは明度の階段（bg < card < tag）になる', () => {
    const { cssVars } = generateThemeTokens(graphite)
    const lum = (hex: string): number => parseInt(hex.slice(1), 16)
    expect(lum(cssVars['--bg-card'])).toBeGreaterThan(lum(cssVars['--bg']))
    expect(lum(cssVars['--bg-tag'])).toBeGreaterThan(lum(cssVars['--bg-card']))
  })

  it('ダークはシャドウトークンを上書きする', () => {
    const { cssVars } = generateThemeTokens(graphite)
    expect(cssVars['--shadow-glass']).toBeDefined()
    expect(cssVars['--shadow-elevated']).toBeDefined()
  })

  it('ライトはシャドウを上書きしない', () => {
    const { cssVars } = generateThemeTokens(milk)
    expect(cssVars['--shadow-glass']).toBeUndefined()
  })
})

describe('overrides', () => {
  it('指定したトークンだけ上書きされる', () => {
    const { cssVars } = generateThemeTokens({ ...milk, overrides: { '--accent': '#123456' } })
    expect(cssVars['--accent']).toBe('#123456')
    expect(cssVars['--bg']).toBe(generateThemeTokens(milk).cssVars['--bg'])
  })
})

describe('全テーマ生成', () => {
  it('11テーマすべてが例外なく生成できる', () => {
    for (const params of THEME_PARAMS) {
      expect(() => generateThemeTokens(params), params.id).not.toThrow()
    }
  })
})
