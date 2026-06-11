// テーマの源泉となる OKLCH パラメータ。色の実値は themeTokens.ts が生成する。

export type JuiceProfile = 'calm' | 'vivid'

export interface ThemeParams {
  id: string
  name: string
  emoji: string
  dark: boolean
  /** 背景の色味（OKLCH hue 角） */
  bgHue: number
  /** 背景の色の濃さ（0 = 無彩色） */
  bgChroma: number
  accentHue: number
  accentChroma: number
  /** アクセントの明度（ライトは 0.25〜0.55、ダークは 0.78〜0.92 目安） */
  accentLightness: number
  juiceProfile: JuiceProfile
  /** スタートボタン等をグラデーション表示するテーマ */
  gradient?: boolean
  /** 自動生成が微妙なトークンの個別上書き */
  overrides?: Partial<Record<string, string>>
}

export const THEME_PARAMS: ThemeParams[] = [
  // ===== ライト =====
  { id: 'milk', name: 'Milk', emoji: '🥛', dark: false, bgHue: 286, bgChroma: 0.002, accentHue: 286, accentChroma: 0.005, accentLightness: 0.25, juiceProfile: 'calm' },
  { id: 'oatmilk', name: 'Oatmilk', emoji: '🌾', dark: false, bgHue: 80, bgChroma: 0.012, accentHue: 45, accentChroma: 0.13, accentLightness: 0.52, juiceProfile: 'calm' },
  { id: 'matcha', name: 'Matcha', emoji: '🍵', dark: false, bgHue: 130, bgChroma: 0.012, accentHue: 135, accentChroma: 0.09, accentLightness: 0.5, juiceProfile: 'calm' },
  { id: 'soda', name: 'Soda', emoji: '🫧', dark: false, bgHue: 240, bgChroma: 0.012, accentHue: 245, accentChroma: 0.12, accentLightness: 0.52, juiceProfile: 'calm' },
  { id: 'grape', name: 'Grape', emoji: '🍇', dark: false, bgHue: 285, bgChroma: 0.012, accentHue: 278, accentChroma: 0.15, accentLightness: 0.5, juiceProfile: 'calm' },
  { id: 'mandarin', name: 'Mandarin', emoji: '🍊', dark: false, bgHue: 75, bgChroma: 0.015, accentHue: 55, accentChroma: 0.15, accentLightness: 0.55, juiceProfile: 'vivid', gradient: true },
  { id: 'berry', name: 'Berry', emoji: '🍓', dark: false, bgHue: 350, bgChroma: 0.01, accentHue: 355, accentChroma: 0.16, accentLightness: 0.55, juiceProfile: 'vivid', gradient: true },
  // ===== ダーク =====
  { id: 'graphite', name: 'Graphite', emoji: '🖤', dark: true, bgHue: 286, bgChroma: 0.004, accentHue: 286, accentChroma: 0.005, accentLightness: 0.92, juiceProfile: 'calm' },
  { id: 'midnight', name: 'Midnight', emoji: '🌌', dark: true, bgHue: 260, bgChroma: 0.025, accentHue: 265, accentChroma: 0.1, accentLightness: 0.78, juiceProfile: 'calm' },
  { id: 'cassis', name: 'Cassis', emoji: '🍷', dark: true, bgHue: 320, bgChroma: 0.025, accentHue: 310, accentChroma: 0.1, accentLightness: 0.78, juiceProfile: 'calm' },
  { id: 'espresso', name: 'Espresso', emoji: '☕', dark: true, bgHue: 60, bgChroma: 0.015, accentHue: 70, accentChroma: 0.09, accentLightness: 0.78, juiceProfile: 'calm' },
]

export const DEFAULT_THEME_ID = 'milk'

export function findThemeParams(id: string): ThemeParams | undefined {
  return THEME_PARAMS.find(t => t.id === id)
}
