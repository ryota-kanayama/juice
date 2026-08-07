// リリースノート本文（CHANGELOG 形式の Markdown）を描画用のブロック列に変換する。
//
// 対象は CHANGELOG で実際に使われている記法だけに絞る。解釈できない行は段落として
// そのまま出すので、想定外の記法が入っても読めなくなることはない。
// Markdown ライブラリは入れない（見た目はどのみち自前で当てるため、依存に見合わない）。

export type ReleaseNoteBlock =
  | { kind: 'section'; emoji: string; label: string; items: string[] }
  | { kind: 'paragraph'; text: string }

/** `### ✨ 新機能` を絵文字とラベルに分ける。絵文字が無ければ emoji は空文字。 */
function parseHeading(line: string): { emoji: string; label: string } | null {
  const m = /^###\s+(.*)$/.exec(line)
  if (!m) return null
  const rest = m[1].trim()
  const sp = rest.indexOf(' ')
  if (sp > 0) {
    const head = rest.slice(0, sp)
    // 文字も数字も含まないなら絵文字とみなす（日本語のラベルは \p{L} に当たる）
    if (!/[\p{L}\p{N}]/u.test(head)) {
      return { emoji: head, label: rest.slice(sp + 1).trim() }
    }
  }
  return { emoji: '', label: rest }
}

export function parseReleaseNotes(body: string): ReleaseNoteBlock[] {
  const blocks: ReleaseNoteBlock[] = []
  // 現在のセクション。blocks にも同じ参照が入っているので、items への push は描画側に届く
  let section: { kind: 'section'; emoji: string; label: string; items: string[] } | null = null
  // 直前の項目に続き行を足せる状態か（空行で切れる）
  let openItem = false

  for (const raw of body.split('\n')) {
    // 配布向け footer の区切り。ここから先はユーザー向けではない
    if (raw.trim() === '---') break

    if (raw.trim() === '') {
      openItem = false
      continue
    }

    const heading = parseHeading(raw)
    if (heading) {
      section = { kind: 'section', emoji: heading.emoji, label: heading.label, items: [] }
      blocks.push(section)
      openItem = false
      continue
    }

    const item = /^-\s+(.*)$/.exec(raw.trim())
    if (item) {
      // 見出しより前に箇条書きが来たら、ラベルなしのセクションで受ける
      if (section === null) {
        section = { kind: 'section', emoji: '', label: '', items: [] }
        blocks.push(section)
      }
      section.items.push(item[1].trim())
      openItem = true
      continue
    }

    // 続き行（インデントされていて、直前が項目）
    if (openItem && section !== null && /^\s{2,}\S/.test(raw)) {
      section.items[section.items.length - 1] += raw.trim()
      continue
    }

    // それ以外は段落としてそのまま出す
    blocks.push({ kind: 'paragraph', text: raw.trim() })
    openItem = false
  }

  return blocks
}
