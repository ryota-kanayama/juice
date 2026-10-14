import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOUR_STEPS, type TourStep } from './tourSteps'

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

const stepsFor = (...targets: string[]): TourStep[] =>
  TOUR_STEPS.filter(s => s.target !== null && targets.includes(s.target))

describe('TOUR_STEPS', () => {
  it.each(TOUR_STEPS.map((s, i) => [i, s] as const))('ステップ %i はタイトルと本文を持つ', (_i, step) => {
    const filled = [step.title, step.body].every(text => text.length > 0)

    expect(filled).toBe(true)
  })

  it('最初と最後のステップは中央表示（target が null）', () => {
    const ends = [TOUR_STEPS[0], TOUR_STEPS.at(-1)!]

    expect(ends.map(s => s.target)).toEqual([null, null])
  })

  it('業務開始・ヘルプ・各タブ・デモ・勤怠操作を案内する', () => {
    const targets = TOUR_STEPS.map(s => s.target)

    expect(targets).toEqual(expect.arrayContaining([
      '[data-tour="work-start"]',
      '[data-tour="help"]',
      '[data-tour="demo-pour"]',
      '[data-session-item]',
      '[data-tour="demo-worktime"]',
      '[data-tour="tab-calendar"]',
      '[data-tour="tab-attendance"]',
      '[data-tour="att-copy"]',
      '[data-tour="att-send"]',
    ]))
  })

  it('デモを出すステップは、注ぐ・記録まわり・勤務時間の順に並ぶ', () => {
    const demoSteps = TOUR_STEPS.filter(s => s.scene?.demo === true)

    expect(demoSteps.map(s => s.target)).toEqual([
      '[data-tour="demo-pour"]',
      '[data-session-item]',
      '[data-session-item]',
      '[data-session-item]',
      '[data-tour="demo-worktime"]',
    ])
  })

  it('記録まわりのステップはタイマータブでデモ一覧を出す', () => {
    const scenes = stepsFor('[data-session-item]').map(s => s.scene)

    expect(scenes).toEqual(Array(3).fill(expect.objectContaining({ tab: 'timer', demo: true })))
  })

  it('勤怠操作のステップは勤怠タブへ切り替える', () => {
    const tabs = stepsFor('[data-tour="att-copy"]', '[data-tour="att-send"]').map(s => s.scene?.tab)

    expect(tabs).toEqual(['attendance', 'attendance'])
  })

  it('タブと勤怠操作のステップではデモを出さない', () => {
    const steps = stepsFor(
      '[data-tour="tab-calendar"]',
      '[data-tour="tab-attendance"]',
      '[data-tour="att-copy"]',
      '[data-tour="att-send"]',
    )

    expect(steps.filter(s => s.scene?.demo === true)).toEqual([])
  })

  it('「カレンダーでできること」は中央表示', () => {
    const step = TOUR_STEPS.find(s => s.title === 'カレンダーでできること')

    expect(step).toMatchObject({ target: null })
  })

  it('target のセレクタはすべて、ソースに実在する要素を指す', () => {
    const sources = collectSources(SRC_ROOT).map(p => readFileSync(p, 'utf8')).join('\n')
    const anchors = new Set([...sources.matchAll(/data-tour="([^"]+)"/g)].map(m => `[data-tour="${m[1]}"]`))
    if (sources.includes('data-session-item')) anchors.add('[data-session-item]')

    const missing = TOUR_STEPS
      .map(s => s.target)
      .filter((t): t is string => t !== null && !anchors.has(t))

    expect(missing).toEqual([])
  })
})
