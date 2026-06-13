// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { dailyStore } from './dailyStore'

const DATE = '2026-06-13'
const KEY = `sessionOrder.${DATE}`

describe('dailyStore.getSessionOrder', () => {
  afterEach(() => localStorage.clear())

  it('未保存なら null', () => {
    expect(dailyStore.getSessionOrder(DATE)).toBeNull()
  })

  it('保存した順序を配列で返す', () => {
    dailyStore.setSessionOrder(DATE, ['b', 'a'])
    expect(dailyStore.getSessionOrder(DATE)).toEqual(['b', 'a'])
  })

  it('破損した JSON でも例外を投げず null を返す', () => {
    localStorage.setItem(KEY, '{壊れた')
    expect(() => dailyStore.getSessionOrder(DATE)).not.toThrow()
    expect(dailyStore.getSessionOrder(DATE)).toBeNull()
  })

  it('配列でない / 文字列以外を含む値は null を返す', () => {
    localStorage.setItem(KEY, JSON.stringify({ not: 'array' }))
    expect(dailyStore.getSessionOrder(DATE)).toBeNull()
    localStorage.setItem(KEY, JSON.stringify(['a', 1, 'b']))
    expect(dailyStore.getSessionOrder(DATE)).toBeNull()
  })
})
