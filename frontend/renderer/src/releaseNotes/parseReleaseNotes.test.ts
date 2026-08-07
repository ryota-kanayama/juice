import { describe, it, expect } from 'vitest'
import { parseReleaseNotes } from './parseReleaseNotes'

describe('parseReleaseNotes', () => {
  it('見出しを絵文字とラベルに分ける', () => {
    const blocks = parseReleaseNotes('### ✨ 新機能\n\n- カレンダーが開けます')
    expect(blocks).toEqual([
      { kind: 'section', emoji: '✨', label: '新機能', items: ['カレンダーが開けます'] },
    ])
  })

  it('絵文字が無い見出しも受け付ける', () => {
    const blocks = parseReleaseNotes('### その他\n\n- 何か')
    expect(blocks).toEqual([
      { kind: 'section', emoji: '', label: 'その他', items: ['何か'] },
    ])
  })

  it('折り返された続き行を1つの項目に畳む', () => {
    const body = [
      '### 🔧 改善',
      '',
      '- カレンダーの週表示で、同じ時間帯に複数の作業があるとき、',
      '  ブロックが横に並ぶようになりました',
      '- 別の項目',
    ].join('\n')
    const blocks = parseReleaseNotes(body)
    expect(blocks).toEqual([
      {
        kind: 'section',
        emoji: '🔧',
        label: '改善',
        items: [
          'カレンダーの週表示で、同じ時間帯に複数の作業があるとき、ブロックが横に並ぶようになりました',
          '別の項目',
        ],
      },
    ])
  })

  it('--- 以降を捨てる（配布向けの footer）', () => {
    const body = [
      '### 🐛 修正',
      '',
      '- 直しました',
      '',
      '---',
      '',
      '未署名ビルドです。arm64 / x64 の DMG を添付しています。',
    ].join('\n')
    const blocks = parseReleaseNotes(body)
    expect(blocks).toEqual([
      { kind: 'section', emoji: '🐛', label: '修正', items: ['直しました'] },
    ])
  })

  it('複数のセクションを順番どおりに返す', () => {
    const body = '### ✨ 新機能\n\n- 一\n\n### 🐛 修正\n\n- 二'
    const blocks = parseReleaseNotes(body)
    expect(blocks.map(b => b.kind === 'section' ? b.label : b.text)).toEqual(['新機能', '修正'])
  })

  it('解釈できない行は段落としてそのまま出す', () => {
    const body = '### ✨ 新機能\n\n- 一\n\nここは箇条書きではない説明です。'
    const blocks = parseReleaseNotes(body)
    expect(blocks).toEqual([
      { kind: 'section', emoji: '✨', label: '新機能', items: ['一'] },
      { kind: 'paragraph', text: 'ここは箇条書きではない説明です。' },
    ])
  })

  it('見出しの前にある箇条書きも落とさない', () => {
    const blocks = parseReleaseNotes('- 見出しなしの項目')
    expect(blocks).toEqual([
      { kind: 'section', emoji: '', label: '', items: ['見出しなしの項目'] },
    ])
  })

  it('空文字は空配列', () => {
    expect(parseReleaseNotes('')).toEqual([])
    expect(parseReleaseNotes('   \n\n  ')).toEqual([])
  })
})
