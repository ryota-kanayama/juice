import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme } from './applyTheme'

const root = document.documentElement
const cssVar = (name: string): string => root.style.getPropertyValue(name)
const HEX = /^#[0-9a-f]{6}$/

beforeEach(() => {
  // applyTheme は前回適用したキーをモジュール内に覚えているため、既定テーマで揃えてから消す
  applyTheme('milk')
  root.removeAttribute('style')
  delete root.dataset.theme
})

describe('applyTheme', () => {
  it('data-theme 属性にテーマ ID を設定する', () => {
    applyTheme('matcha')

    expect(root.dataset.theme).toBe('matcha')
  })

  it('色の CSS 変数を documentElement に設定する', () => {
    applyTheme('matcha')

    expect([cssVar('--bg'), cssVar('--accent')]).toEqual([expect.stringMatching(HEX), expect.stringMatching(HEX)])
  })

  it('ジュース色を --juice-* 変数として設定する', () => {
    applyTheme('matcha')

    expect(cssVar('--juice-strawberry')).toMatch(HEX)
  })

  it('不明な ID は milk にフォールバックする', () => {
    applyTheme('does-not-exist')

    expect(root.dataset.theme).toBe('milk')
  })

  it('テーマを切り替えると同じ変数を新しい値で上書きする', () => {
    applyTheme('milk')
    const milkBg = cssVar('--bg')

    applyTheme('graphite')

    expect(cssVar('--bg')).not.toBe(milkBg)
  })

  it('ダークにしかない変数（shadow）は、ライトへ切り替えると消す', () => {
    applyTheme('graphite')

    applyTheme('milk')

    expect(cssVar('--shadow-glass')).toBe('')
  })

  it('ダークでは shadow 変数を設定する', () => {
    applyTheme('graphite')

    expect(cssVar('--shadow-glass')).not.toBe('')
  })

  it('同じテーマを再適用しても同じ値になる（キャッシュから適用）', () => {
    applyTheme('soda')
    const first = cssVar('--bg')
    root.removeAttribute('style')

    applyTheme('soda')

    expect(cssVar('--bg')).toBe(first)
  })
})
