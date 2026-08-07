import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOUR_STEPS } from './tourSteps'

/**
 * frontend/renderer/src の絶対パス（このテストは src/tour/ に置かれている）。
 * jsdom 環境では `new URL(relative, string)` の2引数形が file: base を無視して
 * jsdom の疑似オリジン（http://localhost:3000）を基準に解決してしまうため、
 * 先に import.meta.url を URL オブジェクト化してから base として渡す。
 */
const SRC_ROOT = fileURLToPath(new URL('../', new URL(import.meta.url)))

/**
 * ツアーのアンカーを探すためにソースを集める。
 * テストファイルとツアー定義自身は、セレクタの「実在」の根拠にならないので除く。
 */
function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      collectSources(path, acc)
      continue
    }
    if (!/\.tsx?$/.test(path)) continue
    if (/\.test\.tsx?$/.test(path)) continue
    if (path.endsWith('tourSteps.ts')) continue
    acc.push(path)
  }
  return acc
}

describe('TOUR_STEPS', () => {
  it('14 ステップで各要素に title/body がある', () => {
    expect(TOUR_STEPS).toHaveLength(14)
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.body.length).toBeGreaterThan(0)
    }
  })

  it('業務開始・ヘルプ・各タブ・デモ・勤怠操作のターゲットを含む', () => {
    const targets = TOUR_STEPS.map(s => s.target)
    expect(targets).toContain('[data-tour="work-start"]')
    expect(targets).toContain('[data-tour="help"]')
    expect(targets).toContain('[data-tour="demo-pour"]')
    expect(targets).toContain('[data-session-item]')
    expect(targets).toContain('[data-tour="demo-worktime"]')
    expect(targets).toContain('[data-tour="tab-calendar"]')
    expect(targets).toContain('[data-tour="tab-attendance"]')
    expect(targets).toContain('[data-tour="att-copy"]')
    expect(targets).toContain('[data-tour="att-send"]')
  })

  it('勤怠操作ステップは attendance タブへ切替（demo は付かない）', () => {
    const attSteps = TOUR_STEPS.filter(
      s => s.target === '[data-tour="att-copy"]' || s.target === '[data-tour="att-send"]'
    )
    expect(attSteps).toHaveLength(2)
    for (const s of attSteps) {
      expect(s.scene?.tab).toBe('attendance')
      expect(s.scene?.demo).not.toBe(true)
    }
  })

  it('記録まわりの 3 ステップはデモ一覧を出した状態で案内する', () => {
    const itemSteps = TOUR_STEPS.filter(s => s.target === '[data-session-item]')
    expect(itemSteps).toHaveLength(3)
    for (const s of itemSteps) {
      expect(s.scene?.tab).toBe('timer')
      expect(s.scene?.demo).toBe(true)
    }
  })

  it('デモ 5 ステップに scene.demo が付く', () => {
    const demoSteps = TOUR_STEPS.filter(s => s.scene?.demo === true)
    expect(demoSteps.map(s => s.target)).toEqual([
      '[data-tour="demo-pour"]',
      '[data-session-item]',
      '[data-session-item]',
      '[data-session-item]',
      '[data-tour="demo-worktime"]',
    ])
  })

  it('カレンダー・勤怠のタブステップに demo は付かない', () => {
    const tabSteps = TOUR_STEPS.filter(
      s => s.target === '[data-tour="tab-calendar"]' || s.target === '[data-tour="tab-attendance"]'
    )
    for (const s of tabSteps) expect(s.scene?.demo).not.toBe(true)
  })

  it('カレンダーの説明ステップは中央表示（target が null）', () => {
    const calendarNote = TOUR_STEPS.find(s => s.title === 'カレンダーでできること')
    expect(calendarNote).toBeDefined()
    expect(calendarNote?.target).toBeNull()
  })

  it('最初と最後は中央表示（target が null）', () => {
    expect(TOUR_STEPS[0].target).toBeNull()
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeNull()
  })

  it('すべての target が実在するセレクタを指す', () => {
    const sources = collectSources(SRC_ROOT)
      .map(p => readFileSync(p, 'utf8'))
      .join('\n')
    const anchors = new Set(
      [...sources.matchAll(/data-tour="([^"]+)"/g)].map(m => m[1])
    )
    const hasSessionItem = sources.includes('data-session-item')

    for (const step of TOUR_STEPS) {
      if (step.target === null) continue
      if (step.target === '[data-session-item]') {
        expect(hasSessionItem, 'data-session-item が実在しない').toBe(true)
        continue
      }
      const matched = step.target.match(/^\[data-tour="(.+)"\]$/)
      expect(matched, `未知の形式のセレクタ: ${step.target}`).not.toBeNull()
      expect(
        anchors.has(matched![1]),
        `data-tour="${matched![1]}" を持つ要素がソースに無い`
      ).toBe(true)
    }
  })
})
