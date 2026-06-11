// セッションの色（ジュースの色）。今後は色キーを保存し、表示時に現テーマの
// パレット（--juice-* CSS変数）へ解決する。過去データの hex はそのまま表示する。

import { JUICE_KEYS, type JuiceKey } from '../theme/themeTokens'

export const JUICE_COLOR_KEYS: readonly JuiceKey[] = JUICE_KEYS

/** パレットからランダムに1キー選ぶ */
export function randomColor(): JuiceKey {
  return JUICE_COLOR_KEYS[Math.floor(Math.random() * JUICE_COLOR_KEYS.length)]
}

/**
 * セッションの color 値を CSS で使える色に解決する。
 * - '#...'（旧データの hex）はそのまま
 * - キーは現テーマのジュース色 CSS 変数に解決
 */
export function resolveJuiceColor(value: string): string {
  if (value.startsWith('#')) return value
  if ((JUICE_COLOR_KEYS as readonly string[]).includes(value)) {
    return `var(--juice-${value})`
  }
  return `var(--juice-${JUICE_COLOR_KEYS[0]})`
}
