// テーマパラメータから全トークンを生成する。設計ルール（明度の階段・ダーク減彩・
// コントラスト確保）はこのファイルに集約する。

import type { ThemeParams } from './themeParams'
import { oklchToHex, contrastRatio, hexToHslTriplet } from './colorUtils'

/** ジュース色のキーと hue（果物のイメージ色） */
export const JUICE_HUES = {
  strawberry: 25,
  orange: 60,
  lemon: 95,
  grapefruit: 40,
  peach: 20,
  grape: 300,
  blueberry: 260,
  cassis: 330,
  muscat: 130,
  kiwi: 150,
} as const

export type JuiceKey = keyof typeof JUICE_HUES
export const JUICE_KEYS = Object.keys(JUICE_HUES) as JuiceKey[]

export interface ThemeTokens {
  cssVars: Record<string, string>
  juiceColors: Record<JuiceKey, string>
}

/** ダークテーマのアクセント彩度上限（減彩ルール） */
const DARK_ACCENT_CHROMA_CAP = 0.12

function generateJuiceColors(params: ThemeParams): Record<JuiceKey, string> {
  // ダーク: 明るく減彩 / calm: 彩度控えめ / vivid: 高彩度
  const l = params.dark ? 0.72 : 0.58
  const c = params.dark ? 0.1 : params.juiceProfile === 'vivid' ? 0.16 : 0.1
  const entries = JUICE_KEYS.map(key => [key, oklchToHex(l, c, JUICE_HUES[key])])
  return Object.fromEntries(entries) as Record<JuiceKey, string>
}

function lightVars(p: ThemeParams): Record<string, string> {
  const { bgHue: h, bgChroma: c } = p
  const accent = oklchToHex(p.accentLightness, p.accentChroma, p.accentHue)
  const bg = oklchToHex(0.975, c, h)
  const bgCard = oklchToHex(0.995, c * 0.4, h)
  const bgTag = oklchToHex(0.945, c * 1.2, h)
  return {
    '--bg': bg,
    '--bg-card': bgCard,
    '--bg-tag': bgTag,
    '--bg-hover': bgTag,
    '--border': oklchToHex(0.91, c, h),
    '--border-light': oklchToHex(0.95, c * 0.8, h),
    '--text-primary': oklchToHex(0.22, Math.min(c * 2, 0.04), h),
    '--text-secondary': oklchToHex(0.42, Math.min(c * 2, 0.04), h),
    '--text-muted': oklchToHex(0.55, Math.min(c * 1.5, 0.03), h),
    '--accent': accent,
    '--accent-secondary': oklchToHex(p.accentLightness - 0.06, p.accentChroma, p.accentHue),
    '--accent-hover': oklchToHex(p.accentLightness - 0.05, p.accentChroma, p.accentHue),
    '--accent-light': oklchToHex(0.93, p.accentChroma * 0.35, p.accentHue),
    '--glass-bg': bgCard,
    '--glass-border': oklchToHex(0.91, c, h),
  }
}

function darkVars(p: ThemeParams): Record<string, string> {
  const { bgHue: h, bgChroma: c } = p
  const accentChroma = Math.min(p.accentChroma, DARK_ACCENT_CHROMA_CAP)
  const bg = oklchToHex(0.16, c, h)
  const bgCard = oklchToHex(0.21, c * 1.1, h)
  const bgTag = oklchToHex(0.26, c * 1.2, h)
  return {
    '--bg': bg,
    '--bg-card': bgCard,
    '--bg-tag': bgTag,
    '--bg-hover': bgTag,
    '--border': oklchToHex(0.28, c * 1.2, h),
    '--border-light': oklchToHex(0.23, c, h),
    '--text-primary': oklchToHex(0.96, Math.min(c, 0.01), h),
    '--text-secondary': oklchToHex(0.72, Math.min(c, 0.02), h),
    '--text-muted': oklchToHex(0.58, Math.min(c, 0.02), h),
    '--accent': oklchToHex(p.accentLightness, accentChroma, p.accentHue),
    '--accent-secondary': oklchToHex(p.accentLightness - 0.05, accentChroma, p.accentHue),
    '--accent-hover': oklchToHex(Math.min(p.accentLightness + 0.05, 0.97), accentChroma, p.accentHue),
    '--accent-light': oklchToHex(0.3, accentChroma * 0.5, p.accentHue),
    '--glass-bg': bgCard,
    '--glass-border': oklchToHex(0.28, c * 1.2, h),
    '--shadow-glass': '0 1px 3px rgba(0, 0, 0, 0.4)',
    '--shadow-elevated': '0 10px 30px rgba(0, 0, 0, 0.5)',
  }
}

function scVars(vars: Record<string, string>, dark: boolean): Record<string, string> {
  const t = hexToHslTriplet
  return {
    '--sc-background': t(vars['--bg']),
    '--sc-foreground': t(vars['--text-primary']),
    '--sc-card': t(vars['--bg-card']),
    '--sc-card-foreground': t(vars['--text-primary']),
    '--sc-popover': t(vars['--bg-card']),
    '--sc-popover-foreground': t(vars['--text-primary']),
    '--sc-primary': t(vars['--accent']),
    '--sc-primary-foreground': t(vars['--text-on-accent']),
    '--sc-secondary': t(vars['--bg-tag']),
    '--sc-secondary-foreground': t(vars['--text-primary']),
    '--sc-muted': t(vars['--bg-tag']),
    '--sc-muted-foreground': t(vars['--text-secondary']),
    '--sc-accent': t(vars['--bg-tag']),
    '--sc-accent-foreground': t(vars['--text-primary']),
    '--sc-destructive': dark ? '0 62.8% 30.6%' : '0 84.2% 60.2%',
    '--sc-destructive-foreground': '0 0% 98%',
    '--sc-border': t(vars['--border']),
    '--sc-input': t(vars['--border']),
    '--sc-ring': t(vars['--accent']),
  }
}

export function generateThemeTokens(params: ThemeParams): ThemeTokens {
  const base = params.dark ? darkVars(params) : lightVars(params)
  // text-on-accent: 白で 4.5:1 を満たせなければ暗色にする
  const onAccentDark = oklchToHex(0.18, params.bgChroma, params.bgHue)
  base['--text-on-accent'] =
    contrastRatio('#ffffff', base['--accent']) >= 4.5 ? '#ffffff' : onAccentDark
  const overrides = params.overrides
    ? Object.fromEntries(
        Object.entries(params.overrides).filter((e): e is [string, string] => e[1] !== undefined)
      )
    : {}
  const cssVars = { ...base, ...scVars(base, params.dark), ...overrides }
  return { cssVars, juiceColors: generateJuiceColors(params) }
}
