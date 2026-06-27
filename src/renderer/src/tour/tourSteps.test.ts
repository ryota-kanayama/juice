import { describe, it, expect } from 'vitest'
import { TOUR_STEPS } from './tourSteps'

describe('TOUR_STEPS', () => {
  it('7 ステップで各要素に title/body がある', () => {
    expect(TOUR_STEPS).toHaveLength(7)
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.body.length).toBeGreaterThan(0)
    }
  })

  it('業務開始・ヘルプ・各タブのターゲットを含む', () => {
    const targets = TOUR_STEPS.map(s => s.target)
    expect(targets).toContain('[data-tour="work-start"]')
    expect(targets).toContain('[data-tour="help"]')
    expect(targets).toContain('[data-tour="tab-timer"]')
    expect(targets).toContain('[data-tour="tab-calendar"]')
    expect(targets).toContain('[data-tour="tab-attendance"]')
  })

  it('最初と最後は中央表示（target が null）', () => {
    expect(TOUR_STEPS[0].target).toBeNull()
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeNull()
  })
})
