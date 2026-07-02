// テーマピッカー用メタデータ。実体は theme/themeParams.ts のパラメータから導出する。

import { THEME_PARAMS } from './theme/themeParams'
import { generateThemeTokens } from './theme/themeTokens'

export interface ThemeMeta {
  id: string
  name: string
  emoji: string
  bg: string
  accent: string
  accentSecondary?: string
  textPrimary: string
  dark?: boolean
  gradient?: boolean
}

function toMeta(dark: boolean): ThemeMeta[] {
  return THEME_PARAMS.filter(p => p.dark === dark).map(p => {
    const { cssVars } = generateThemeTokens(p)
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      bg: cssVars['--bg'],
      accent: cssVars['--accent'],
      accentSecondary: cssVars['--accent-secondary'],
      textPrimary: cssVars['--text-primary'],
      dark: p.dark || undefined,
      gradient: p.gradient,
    }
  })
}

export const THEMES: ThemeMeta[] = toMeta(false)
export const DARK_THEMES: ThemeMeta[] = toMeta(true)
