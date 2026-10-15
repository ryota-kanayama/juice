import { describe, it, expect } from 'vitest'
import { layoutOverlaps, type Placement, type Span } from './overlapLayout'

const span = (start: number, end: number): Span => ({ start, end })

/** 3等分などの割り切れない値を比較できるよう、小数第3位で丸める */
function rounded(placements: Placement[]): Placement[] {
  const r = (n: number): number => Math.round(n * 1000) / 1000
  return placements.map(p => ({ left: r(p.left), width: r(p.width) }))
}

const THIRD = Math.round((100 / 3) * 1000) / 1000
const TWO_THIRDS = Math.round((200 / 3) * 1000) / 1000

describe('layoutOverlaps', () => {
  it('空配列なら空配列', () => {
    const placements = layoutOverlaps([])

    expect(placements).toEqual([])
  })

  it('単独なら全幅', () => {
    const placements = layoutOverlaps([span(0, 60)])

    expect(rounded(placements)).toEqual([{ left: 0, width: 100 }])
  })

  it('完全に重なる2件は左右半分ずつ', () => {
    const placements = layoutOverlaps([span(0, 60), span(0, 60)])

    expect(rounded(placements)).toEqual([{ left: 0, width: 50 }, { left: 50, width: 50 }])
  })

  it('部分的に重なる2件も半分ずつ', () => {
    const placements = layoutOverlaps([span(0, 60), span(30, 90)])

    expect(rounded(placements)).toEqual([{ left: 0, width: 50 }, { left: 50, width: 50 }])
  })

  it('端が接するだけなら重なりとみなさない', () => {
    const placements = layoutOverlaps([span(0, 60), span(60, 120)])

    expect(rounded(placements)).toEqual([{ left: 0, width: 100 }, { left: 0, width: 100 }])
  })

  it('3件が同時なら3分割', () => {
    const placements = layoutOverlaps([span(0, 60), span(0, 60), span(0, 60)])

    expect(rounded(placements)).toEqual([
      { left: 0, width: THIRD },
      { left: THIRD, width: THIRD },
      { left: TWO_THIRDS, width: THIRD },
    ])
  })

  it('長い1件の右側に、重ならない短い2件が同じ列で縦に並ぶ', () => {
    const placements = layoutOverlaps([span(0, 180), span(0, 60), span(60, 120)])

    expect(rounded(placements)).toEqual([
      { left: 0, width: 50 },
      { left: 50, width: 50 },
      { left: 50, width: 50 },
    ])
  })

  it('同じ開始なら長い方が左に来る', () => {
    // 短い方を先に渡しても、長い方が left=0 になる
    const placements = layoutOverlaps([span(0, 60), span(0, 180)])

    expect(rounded(placements)).toEqual([{ left: 50, width: 50 }, { left: 0, width: 50 }])
  })

  it('右隣の列が空いていれば幅を伸ばす', () => {
    // 2列のクラスタの中で、3件目は右隣の列と重ならないので全幅へ伸びる
    const placements = layoutOverlaps([span(0, 120), span(0, 60), span(60, 120)])

    expect(rounded(placements)[1]).toEqual({ left: 50, width: 50 })
  })

  it('右隣の列の空きが途切れたところで伸ばすのを止める', () => {
    // A(0-60) B(0-60) C(30-90) で3列。D(60-120) は1列目に入り、2列目（B）は空いているが
    // 3列目の C と重なるので、2列分で止まる
    const placements = layoutOverlaps([span(0, 60), span(0, 60), span(30, 90), span(60, 120)])

    expect(rounded(placements)[3]).toEqual({ left: 0, width: TWO_THIRDS })
  })

  it('右隣の列が空いている間だけ幅を伸ばす', () => {
    // A(0-60) B(0-60) C(0-60) が3列。D(60-120) は1列目に入り、右の2列とも空いているので全幅
    const placements = layoutOverlaps([span(0, 60), span(0, 60), span(0, 60), span(60, 120)])

    expect(rounded(placements)[3]).toEqual({ left: 0, width: 100 })
  })

  it('重なりが途切れた後の一団は別クラスタとして全幅になる', () => {
    const placements = layoutOverlaps([span(0, 60), span(0, 60), span(120, 180)])

    expect(rounded(placements)[2]).toEqual({ left: 0, width: 100 })
  })

  it('連鎖して重なる一団は同じクラスタとして列数を揃える', () => {
    // A-B が重なり、B-C が重なる（A と C は重ならない）→ 3件で1クラスタ・2列
    const placements = layoutOverlaps([span(0, 60), span(30, 90), span(60, 120)])

    expect(rounded(placements)).toEqual([
      { left: 0, width: 50 },
      { left: 50, width: 50 },
      { left: 0, width: 50 },
    ])
  })

  it('入力の並び順に依存しない（結果は入力順で返る）', () => {
    const spans = [span(0, 180), span(0, 60), span(60, 120)]
    const forward = rounded(layoutOverlaps(spans))

    const reversed = rounded(layoutOverlaps([...spans].reverse()))

    expect(reversed).toEqual([...forward].reverse())
  })

  it('left + width が 100 を超えない', () => {
    const spans = [span(0, 60), span(0, 60), span(0, 60), span(30, 90)]

    const placements = layoutOverlaps(spans)

    expect(placements.every(p => p.left + p.width <= 100.0001)).toBe(true)
  })
})
