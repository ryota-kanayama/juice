// 生成済みトークンを DOM に適用する。テーマIDの正規化はメインプロセス
// （settingsStore.migrateThemeId）が担い、ここは防御的フォールバックのみ。

import { DEFAULT_THEME_ID, findThemeParams } from './themeParams'
import { generateThemeTokens, type ThemeTokens } from './themeTokens'

const tokenCache = new Map<string, ThemeTokens>()

export function applyTheme(themeId: string): void {
  const params = findThemeParams(themeId) ?? findThemeParams(DEFAULT_THEME_ID)!
  let tokens = tokenCache.get(params.id)
  if (!tokens) {
    tokens = generateThemeTokens(params)
    tokenCache.set(params.id, tokens)
  }
  const root = document.documentElement
  root.dataset.theme = params.id
  for (const [key, value] of Object.entries(tokens.cssVars)) {
    root.style.setProperty(key, value)
  }
  for (const [key, value] of Object.entries(tokens.juiceColors)) {
    root.style.setProperty(`--juice-${key}`, value)
  }
}
