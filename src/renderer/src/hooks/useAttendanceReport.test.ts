import { describe, it, expect } from 'vitest'
import { calcBreakMinutes } from './useAttendanceReport'

describe('calcBreakMinutes', () => {
  it('12:00〜13:00 は 60', () => {
    expect(calcBreakMinutes('12:00', '13:00')).toBe(60)
  })
  it('12:30〜13:15 は 45', () => {
    expect(calcBreakMinutes('12:30', '13:15')).toBe(45)
  })
  it('breakEnd が null なら 60（フォールバック）', () => {
    expect(calcBreakMinutes('12:00', null)).toBe(60)
  })
  it('breakStart が null なら 60（フォールバック）', () => {
    expect(calcBreakMinutes(null, '13:00')).toBe(60)
  })
  it('終了が開始以前なら 60（フォールバック）', () => {
    expect(calcBreakMinutes('13:00', '12:00')).toBe(60)
  })
  it('両方 null なら 60', () => {
    expect(calcBreakMinutes(null, null)).toBe(60)
  })
})
