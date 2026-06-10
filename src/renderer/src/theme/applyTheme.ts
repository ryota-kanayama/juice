// 生成済みトークンを DOM に適用する。テーマIDの正規化はメインプロセス
// （settingsStore.migrateThemeId）が担い、ここは防御的フォールバックのみ。

import { DEFAULT_THEME_ID, findThemeParams } from './themeParams'
import { generateThemeTokens, type ThemeTokens } from './themeTokens'

const tokenCache = new Map<string, ThemeTokens>()

// 前回適用したキーを追跡し、テーマ切替時に不要なキーを removeProperty で掃除する
let appliedKeys: string[] = []

export function applyTheme(themeId: string): void {
  const params = findThemeParams(themeId) ?? findThemeParams(DEFAULT_THEME_ID)!
  let tokens = tokenCache.get(params.id)
  if (!tokens) {
    tokens = generateThemeTokens(params)
    tokenCache.set(params.id, tokens)
  }
  const root = document.documentElement
  root.dataset.theme = params.id

  // 今回適用するキー集合を組み立てる
  const nextKeys: string[] = [
    ...Object.keys(tokens.cssVars),
    ...Object.keys(tokens.juiceColors).map((k) => `--juice-${k}`),
  ]
  const nextKeySet = new Set(nextKeys)

  // 前回適用済みで今回に無いキーを削除する
  for (const key of appliedKeys) {
    if (!nextKeySet.has(key)) {
      root.style.removeProperty(key)
    }
  }

  // 今回のキーを適用する
  for (const [key, value] of Object.entries(tokens.cssVars)) {
    root.style.setProperty(key, value)
  }
  for (const [key, value] of Object.entries(tokens.juiceColors)) {
    root.style.setProperty(`--juice-${key}`, value)
  }

  appliedKeys = nextKeys
}
