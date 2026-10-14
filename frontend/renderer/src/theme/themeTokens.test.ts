import { describe, it, expect } from 'vitest'
import { generateThemeTokens, JUICE_KEYS } from './themeTokens'
import { findThemeParams, THEME_PARAMS } from './themeParams'
import { hexToHslTriplet } from './colorUtils'

const milk = findThemeParams('milk')!
const graphite = findThemeParams('graphite')!

/** hex を数値にした明るさの目安（同系色の比較にだけ使う） */
const lum = (hex: string): number => parseInt(hex.slice(1), 16)

const REQUIRED_VARS = [
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

describe('generateThemeTokens の構造', () => {
  it('必須の CSS 変数をすべて含む', () => {
    const { cssVars } = generateThemeTokens(milk)

    expect(REQUIRED_VARS.filter(key => cssVars[key] === undefined)).toEqual([])
  })

  it('ジュース色はすべてのキーを生成する', () => {
    const { juiceColors } = generateThemeTokens(milk)

    expect(Object.keys(juiceColors).sort()).toEqual([...JUICE_KEYS].sort())
  })

  it('色トークンは hex 形式（--sc- と shadow を除く）', () => {
    const { cssVars } = generateThemeTokens(milk)

    const notHex = Object.entries(cssVars)
      .filter(([key]) => !key.startsWith('--sc-') && !key.startsWith('--shadow'))
      .filter(([, value]) => !/^#[0-9a-f]{6}$/.test(value))
    expect(notHex).toEqual([])
  })
})

describe('ライト / ダークの生成ルール', () => {
  it('ダークは bg < card < tag の順に明るくなる', () => {
    const { cssVars } = generateThemeTokens(graphite)

    const levels = [cssVars['--bg'], cssVars['--bg-card'], cssVars['--bg-tag']].map(lum)

    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('ライトは card が bg より明るく、tag は bg より暗い', () => {
    const { cssVars } = generateThemeTokens(milk)

    const [bg, card, tag] = [cssVars['--bg'], cssVars['--bg-card'], cssVars['--bg-tag']].map(lum)

    expect(card > bg && tag < bg).toBe(true)
  })

  it('ダークはシャドウを上書きする', () => {
    const { cssVars } = generateThemeTokens(graphite)

    expect(cssVars).toMatchObject({ '--shadow-glass': expect.any(String), '--shadow-elevated': expect.any(String) })
  })

  it('ライトはシャドウを上書きしない', () => {
    const { cssVars } = generateThemeTokens(milk)

    expect(cssVars['--shadow-glass']).toBeUndefined()
  })
})

describe('overrides', () => {
  it('指定したトークンを上書きする', () => {
    const { cssVars } = generateThemeTokens({ ...milk, overrides: { '--accent': '#123456' } })

    expect(cssVars['--accent']).toBe('#123456')
  })

  it('指定していないトークンは変えない', () => {
    const original = generateThemeTokens(milk).cssVars['--bg']

    const { cssVars } = generateThemeTokens({ ...milk, overrides: { '--accent': '#123456' } })

    expect(cssVars['--bg']).toBe(original)
  })

  it('--accent を明るい色にすると、その上の文字色は白以外（暗い色）になる', () => {
    const { cssVars } = generateThemeTokens({ ...milk, overrides: { '--accent': '#eeeeee' } })

    expect(cssVars['--text-on-accent']).not.toBe('#ffffff')
  })

  it('--accent の上書きを --sc-primary にも反映する', () => {
    const { cssVars } = generateThemeTokens({ ...milk, overrides: { '--accent': '#eeeeee' } })

    expect(cssVars['--sc-primary']).toBe(hexToHslTriplet('#eeeeee'))
  })
})

it.each(THEME_PARAMS.map(p => [p.id, p] as const))('テーマ %s を例外なく生成できる', (_id, params) => {
  const generate = () => generateThemeTokens(params)

  expect(generate).not.toThrow()
})
