import { describe, it, expect } from 'vitest'
import { TOUR_STEPS } from './tourSteps'

describe('TOUR_STEPS', () => {
  it('11 ステップで各要素に title/body がある', () => {
    expect(TOUR_STEPS).toHaveLength(11)
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

  it('デモ 3 ステップに scene.demo が付く', () => {
    const demoSteps = TOUR_STEPS.filter(s => s.scene?.demo === true)
    expect(demoSteps.map(s => s.target)).toEqual([
      '[data-tour="demo-pour"]',
      '[data-session-item]',
      '[data-tour="demo-worktime"]',
    ])
  })

  it('カレンダー・勤怠ステップに demo は付かない', () => {
    const tabSteps = TOUR_STEPS.filter(
      s => s.target === '[data-tour="tab-calendar"]' || s.target === '[data-tour="tab-attendance"]'
    )
    for (const s of tabSteps) expect(s.scene?.demo).not.toBe(true)
  })

  it('最初と最後は中央表示（target が null）', () => {
    expect(TOUR_STEPS[0].target).toBeNull()
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeNull()
  })
})
