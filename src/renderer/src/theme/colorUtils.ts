// OKLCH ベースの色生成ユーティリティ。テーマトークン生成と検証で使う。

import { formatHex, clampChroma } from 'culori'

/** OKLCH 値を sRGB に丸めて hex 文字列にする */
export function oklchToHex(l: number, c: number, h: number): string {
  const clamped = clampChroma({ mode: 'oklch', l, c, h }, 'oklch')
  // formatHex は Color を受け取ると string を返すが、型シグネチャ上 string | undefined になり得るため
  // ?? でフォールバックを保証する
  return formatHex(clamped) ?? '#000000'
}

/** hex → WCAG 相対輝度 */
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** WCAG コントラスト比（1〜21） */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** hex → shadcn 用 HSL トリプレット文字列（例 "240 10% 3.9%"） */
export function hexToHslTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 0xff) / 255
  const g = ((n >> 8) & 0xff) / 255
  const b = (n & 0xff) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  const round1 = (x: number): number => Math.round(x * 10) / 10
  return `${round1(h * 360)} ${round1(s * 100)}% ${round1(l * 100)}%`
}
