import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateLegacyDailyData } from './migrateLegacy'

const importLegacy = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('bridge', {
  importLegacyDaily: importLegacy,
})

describe('migrateLegacyDailyData', () => {
  beforeEach(() => {
    localStorage.clear()
    importLegacy.mockClear()
  })

  it('localStorage の日次キーを日付ごとにまとめて移行し、フラグと旧キー削除を行う', async () => {
    localStorage.setItem('workStart.2026-06-10', '09:00')
    localStorage.setItem('workEnd.2026-06-10', '18:00')
    localStorage.setItem('telework.2026-06-10', 'true')
    localStorage.setItem('sessionOrder.2026-06-10', JSON.stringify(['b', 'a']))
    localStorage.setItem('unrelated.key', 'keep')

    await migrateLegacyDailyData()

    expect(importLegacy).toHaveBeenCalledWith([
      { date: '2026-06-10', record: { workStart: '09:00', workEnd: '18:00', telework: true, sessionOrder: ['b', 'a'] } },
    ])
    expect(localStorage.getItem('daily.migratedToJson')).toBe('true')
    expect(localStorage.getItem('workStart.2026-06-10')).toBeNull()
    expect(localStorage.getItem('unrelated.key')).toBe('keep')
  })

  it('既に移行済みなら何もしない', async () => {
    localStorage.setItem('daily.migratedToJson', 'true')
    localStorage.setItem('workStart.2026-06-10', '09:00')
    await migrateLegacyDailyData()
    expect(importLegacy).not.toHaveBeenCalled()
  })

  it('対象キーが無くてもフラグだけ立てる', async () => {
    await migrateLegacyDailyData()
    expect(importLegacy).not.toHaveBeenCalled()
    expect(localStorage.getItem('daily.migratedToJson')).toBe('true')
  })

  it('壊れた sessionOrder は捨てて他フィールドは移行する', async () => {
    localStorage.setItem('workStart.2026-06-10', '09:00')
    localStorage.setItem('sessionOrder.2026-06-10', '{not json')
    await migrateLegacyDailyData()
    expect(importLegacy).toHaveBeenCalledWith([
      { date: '2026-06-10', record: { workStart: '09:00' } },
    ])
  })
})
