import { describe, it, expect } from 'vitest'
import { parseReleaseNotes } from './parseReleaseNotes'

const lines = (...rows: string[]): string => rows.join('\n')

describe('parseReleaseNotes', () => {
  it('見出しを絵文字とラベルに分ける', () => {
    const body = lines('### ✨ 新機能', '', '- カレンダーが開けます')

    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([{ kind: 'section', emoji: '✨', label: '新機能', items: ['カレンダーが開けます'] }])
  })

  it('絵文字が無い見出しは、全体をラベルにする', () => {
    const body = lines('### その他', '', '- 何か')

    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([{ kind: 'section', emoji: '', label: 'その他', items: ['何か'] }])
  })

  it('先頭の語が文字を含むなら絵文字とみなさない（空白を含むラベル）', () => {
    const body = lines('### 既知の 問題', '', '- 何か')

    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([{ kind: 'section', emoji: '', label: '既知の 問題', items: ['何か'] }])
  })

  it('折り返された続き行を1つの項目に畳む', () => {
    const body = lines(
      '### 🔧 改善',
      '',
      '- カレンダーの週表示で、同じ時間帯に複数の作業があるとき、',
      '  ブロックが横に並ぶようになりました',
      '- 別の項目',
    )

    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([{
      kind: 'section',
      emoji: '🔧',
      label: '改善',
      items: [
        'カレンダーの週表示で、同じ時間帯に複数の作業があるとき、ブロックが横に並ぶようになりました',
        '別の項目',
      ],
    }])
  })

  it('--- から後ろ（配布向けの注記）を捨てる', () => {
    const body = lines('### 🐛 修正', '', '- 直しました', '', '---', '', '未署名ビルドです。')

    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([{ kind: 'section', emoji: '🐛', label: '修正', items: ['直しました'] }])
  })

  it('複数のセクションを順番どおりに返す', () => {
    const body = lines('### ✨ 新機能', '', '- 一', '', '### 🐛 修正', '', '- 二')

    const blocks = parseReleaseNotes(body)

    expect(blocks.map(b => (b.kind === 'section' ? b.label : b.text))).toEqual(['新機能', '修正'])
  })

  it('箇条書きでも見出しでもない行は段落にする', () => {
    const body = lines('### ✨ 新機能', '', '- 一', '', 'ここは箇条書きではない説明です。')

    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([
      { kind: 'section', emoji: '✨', label: '新機能', items: ['一'] },
      { kind: 'paragraph', text: 'ここは箇条書きではない説明です。' },
    ])
  })

  it('空行のあとの字下げ行は、前の項目の続きにしない', () => {
    const body = lines('### ✨ 新機能', '', '- 一', '', '  別の段落')

    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([
      { kind: 'section', emoji: '✨', label: '新機能', items: ['一'] },
      { kind: 'paragraph', text: '別の段落' },
    ])
  })

  it('見出しより前の箇条書きは、ラベルなしのセクションで受ける', () => {
    const blocks = parseReleaseNotes('- 見出しなしの項目')

    expect(blocks).toEqual([{ kind: 'section', emoji: '', label: '', items: ['見出しなしの項目'] }])
  })

  it.each([
    ['空文字', ''],
    ['空白と改行だけ', '   \n\n  '],
  ])('%s なら空配列', (_label, body) => {
    const blocks = parseReleaseNotes(body)

    expect(blocks).toEqual([])
  })
})
