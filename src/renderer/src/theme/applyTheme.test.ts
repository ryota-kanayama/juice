import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme } from './applyTheme'

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    delete document.documentElement.dataset.theme
    // appliedKeys をリセットするため、テスト間でモジュール状態を初期化する
    applyTheme('milk')
    document.documentElement.removeAttribute('style')
    delete document.documentElement.dataset.theme
  })

  it('data-theme 属性を設定する', () => {
    applyTheme('matcha')
    expect(document.documentElement.dataset.theme).toBe('matcha')
  })

  it('CSS 変数を documentElement に適用する', () => {
    applyTheme('matcha')
    const style = document.documentElement.style
    expect(style.getPropertyValue('--bg')).toMatch(/^#[0-9a-f]{6}$/)
    expect(style.getPropertyValue('--accent')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('ジュース色を --juice-* 変数として適用する', () => {
    applyTheme('matcha')
    expect(document.documentElement.style.getPropertyValue('--juice-strawberry')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('不明な ID は milk にフォールバックする', () => {
    applyTheme('does-not-exist')
    expect(document.documentElement.dataset.theme).toBe('milk')
  })

  it('テーマ切替時に前のテーマの変数が残らない（同キーが上書きされる）', () => {
    applyTheme('milk')
    const milkBg = document.documentElement.style.getPropertyValue('--bg')
    applyTheme('graphite')
    expect(document.documentElement.style.getPropertyValue('--bg')).not.toBe(milkBg)
  })

  it('ダーク→ライト切替で shadow 変数の残留が掃除される', () => {
    applyTheme('graphite')
    expect(document.documentElement.style.getPropertyValue('--shadow-glass')).not.toBe('')
    applyTheme('milk')
    expect(document.documentElement.style.getPropertyValue('--shadow-glass')).toBe('')
  })
})
