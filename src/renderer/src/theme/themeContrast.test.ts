import { describe, it, expect } from 'vitest'
import { generateThemeTokens, JUICE_KEYS } from './themeTokens'
import { THEME_PARAMS } from './themeParams'
import { contrastRatio } from './colorUtils'

// WCAG AA: 本文 4.5:1、非テキストUI 3:1
describe.each(THEME_PARAMS.map(p => [p.id, p] as const))('テーマ %s のコントラスト', (_id, params) => {
  const { cssVars, juiceColors } = generateThemeTokens(params)

  it('text-primary vs bg ≥ 4.5', () => {
    expect(contrastRatio(cssVars['--text-primary'], cssVars['--bg'])).toBeGreaterThanOrEqual(4.5)
  })

  it('text-primary vs bg-card ≥ 4.5', () => {
    expect(contrastRatio(cssVars['--text-primary'], cssVars['--bg-card'])).toBeGreaterThanOrEqual(4.5)
  })

  it('text-secondary vs bg ≥ 4.5', () => {
    expect(contrastRatio(cssVars['--text-secondary'], cssVars['--bg'])).toBeGreaterThanOrEqual(4.5)
  })

  it('text-muted vs bg ≥ 3.0', () => {
    expect(contrastRatio(cssVars['--text-muted'], cssVars['--bg'])).toBeGreaterThanOrEqual(3.0)
  })

  it('text-on-accent vs accent ≥ 4.5', () => {
    expect(contrastRatio(cssVars['--text-on-accent'], cssVars['--accent'])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(JUICE_KEYS)('ジュース色 %s vs bg ≥ 3.0', key => {
    expect(contrastRatio(juiceColors[key], cssVars['--bg'])).toBeGreaterThanOrEqual(3.0)
  })
})

describe('スナップショット', () => {
  it.each(THEME_PARAMS.map(p => [p.id, p] as const))('%s のトークンが意図せず変わっていない', (_id, params) => {
    expect(generateThemeTokens(params)).toMatchSnapshot()
  })
})
