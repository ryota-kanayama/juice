import { describe, it, expect } from 'vitest'
import { generateThemeTokens, JUICE_KEYS } from './themeTokens'
import { THEME_PARAMS } from './themeParams'
import { contrastRatio } from './colorUtils'

// WCAG AA: 本文 4.5:1、非テキストUI 3:1
describe.each(THEME_PARAMS.map(p => [p.id, p] as const))('テーマ %s のコントラスト', (_id, params) => {
  const { cssVars, juiceColors } = generateThemeTokens(params)

  it.each([
    ['--text-primary', '--bg', 4.5],
    ['--text-primary', '--bg-card', 4.5],
    ['--text-secondary', '--bg', 4.5],
    ['--text-muted', '--bg', 3.0],
    ['--text-on-accent', '--accent', 4.5],
  ])('%s と %s は %s:1 以上', (fg, bg, minimum) => {
    const ratio = contrastRatio(cssVars[fg], cssVars[bg])

    expect(ratio).toBeGreaterThanOrEqual(minimum)
  })

  it.each(JUICE_KEYS)('ジュース色 %s と --bg は 3:1 以上', key => {
    const ratio = contrastRatio(juiceColors[key], cssVars['--bg'])

    expect(ratio).toBeGreaterThanOrEqual(3.0)
  })
})

describe('スナップショット', () => {
  it.each(THEME_PARAMS.map(p => [p.id, p] as const))('%s のトークンが意図せず変わっていない', (_id, params) => {
    const tokens = generateThemeTokens(params)

    expect(tokens).toMatchSnapshot()
  })
})
