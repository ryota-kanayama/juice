import { describe, it, expect } from 'vitest'
import { layoutOverlaps, type Span } from './overlapLayout'

/** left/width を小数の誤差を許して比較する */
function expectPlacement(actual: { left: number; width: number }, left: number, width: number): void {
  expect(actual.left).toBeCloseTo(left, 3)
  expect(actual.width).toBeCloseTo(width, 3)
}

describe('layoutOverlaps', () => {
  it('空配列なら空配列', () => {
    expect(layoutOverlaps([])).toEqual([])
  })

  it('単独なら全幅', () => {
    const r = layoutOverlaps([{ start: 0, end: 60 }])
    expectPlacement(r[0], 0, 100)
  })

  it('完全に重なる2件は左右半分ずつ', () => {
    const r = layoutOverlaps([{ start: 0, end: 60 }, { start: 0, end: 60 }])
    expectPlacement(r[0], 0, 50)
    expectPlacement(r[1], 50, 50)
  })

  it('部分的に重なる2件も半分ずつ', () => {
    const r = layoutOverlaps([{ start: 0, end: 60 }, { start: 30, end: 90 }])
    expectPlacement(r[0], 0, 50)
    expectPlacement(r[1], 50, 50)
  })

  it('端が接するだけなら重なりとみなさない', () => {
    const r = layoutOverlaps([{ start: 0, end: 60 }, { start: 60, end: 120 }])
    expectPlacement(r[0], 0, 100)
    expectPlacement(r[1], 0, 100)
  })

  it('3件が同時なら3分割', () => {
    const r = layoutOverlaps([
      { start: 0, end: 60 }, { start: 0, end: 60 }, { start: 0, end: 60 },
    ])
    expectPlacement(r[0], 0, 100 / 3)
    expectPlacement(r[1], 100 / 3, 100 / 3)
    expectPlacement(r[2], 200 / 3, 100 / 3)
  })

  it('長い1件の右側に短い2件が縦に並ぶ', () => {
    // A(0-180) の隣で B(0-60) と C(60-120) が同じ列を共有する
    const r = layoutOverlaps([
      { start: 0, end: 180 }, { start: 0, end: 60 }, { start: 60, end: 120 },
    ])
    expectPlacement(r[0], 0, 50)
    expectPlacement(r[1], 50, 50)
    expectPlacement(r[2], 50, 50)
  })

  it('同じ開始なら長い方が左に来る', () => {
    // 短い方を先に渡しても、長い A が左（left=0）になる
    const r = layoutOverlaps([{ start: 0, end: 60 }, { start: 0, end: 180 }])
    expectPlacement(r[0], 50, 50)
    expectPlacement(r[1], 0, 50)
  })

  it('右隣が空いていれば幅を伸ばす', () => {
    // A(0-60) と B(0-60) が2列を占め、C(60-120) は右隣が空くので全幅へ伸びる
    const r = layoutOverlaps([
      { start: 0, end: 60 }, { start: 0, end: 60 }, { start: 60, end: 120 },
    ])
    expectPlacement(r[0], 0, 50)
    expectPlacement(r[1], 50, 50)
    expectPlacement(r[2], 0, 100)
  })

  it('重ならない一団は別クラスタとして全幅になる', () => {
    const r = layoutOverlaps([
      { start: 0, end: 60 }, { start: 0, end: 60 },
      { start: 120, end: 180 },
    ])
    expectPlacement(r[0], 0, 50)
    expectPlacement(r[1], 50, 50)
    expectPlacement(r[2], 0, 100)
  })

  it('入力の並び順に依存しない', () => {
    const spans: Span[] = [
      { start: 0, end: 180 }, { start: 0, end: 60 }, { start: 60, end: 120 },
    ]
    const forward = layoutOverlaps(spans)
    const reversed = layoutOverlaps([...spans].reverse())
    // reversed は入力順に返るので、元の順に並べ直して比較する
    expectPlacement(reversed[2], forward[0].left, forward[0].width)
    expectPlacement(reversed[1], forward[1].left, forward[1].width)
    expectPlacement(reversed[0], forward[2].left, forward[2].width)
  })

  it('left + width が 100 を超えない', () => {
    const r = layoutOverlaps([
      { start: 0, end: 60 }, { start: 0, end: 60 }, { start: 0, end: 60 },
      { start: 30, end: 90 },
    ])
    for (const p of r) {
      expect(p.left + p.width).toBeLessThanOrEqual(100.0001)
    }
  })
})
