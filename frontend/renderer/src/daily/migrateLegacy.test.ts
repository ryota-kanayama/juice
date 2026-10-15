import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateLegacyDailyData } from './migrateLegacy'

const FLAG = 'daily.migratedToJson'

const importLegacy = vi.fn()
vi.stubGlobal('bridge', { importLegacyDaily: importLegacy })

beforeEach(() => {
  localStorage.clear()
  importLegacy.mockReset().mockResolvedValue(undefined)
})

describe('migrateLegacyDailyData', () => {
  describe('移行する内容', () => {
    it('同じ日付のキーを1件の記録にまとめる', async () => {
      localStorage.setItem('workStart.2026-06-10', '09:00')
      localStorage.setItem('workEnd.2026-06-10', '18:00')
      localStorage.setItem('telework.2026-06-10', 'true')
      localStorage.setItem('sessionOrder.2026-06-10', JSON.stringify(['b', 'a']))

      await migrateLegacyDailyData()

      expect(importLegacy).toHaveBeenCalledWith([
        { date: '2026-06-10', record: { workStart: '09:00', workEnd: '18:00', telework: true, sessionOrder: ['b', 'a'] } },
      ])
    })

    it('日付ごとに別の記録にする', async () => {
      localStorage.setItem('workStart.2026-06-10', '09:00')
      localStorage.setItem('workStart.2026-06-11', '10:00')

      await migrateLegacyDailyData()

      expect(importLegacy.mock.calls[0][0]).toEqual(expect.arrayContaining([
        { date: '2026-06-10', record: { workStart: '09:00' } },
        { date: '2026-06-11', record: { workStart: '10:00' } },
      ]))
    })

    it('telework は "true" 以外を false にする', async () => {
      localStorage.setItem('telework.2026-06-10', 'false')

      await migrateLegacyDailyData()

      expect(importLegacy).toHaveBeenCalledWith([{ date: '2026-06-10', record: { telework: false } }])
    })

    it.each([
      ['JSON として壊れている', '{not json'],
      ['配列でない', '{"a":1}'],
      ['文字列以外を含む', '["a",1]'],
    ])('sessionOrder が%sなら捨てて、他の項目は移行する', async (_label, value) => {
      localStorage.setItem('workStart.2026-06-10', '09:00')
      localStorage.setItem('sessionOrder.2026-06-10', value)

      await migrateLegacyDailyData()

      expect(importLegacy).toHaveBeenCalledWith([{ date: '2026-06-10', record: { workStart: '09:00' } }])
    })
  })

  describe('移行後の後片付け', () => {
    it('移行済みのフラグを立てる', async () => {
      localStorage.setItem('workStart.2026-06-10', '09:00')

      await migrateLegacyDailyData()

      expect(localStorage.getItem(FLAG)).toBe('true')
    })

    it('移行した旧キーを消す', async () => {
      localStorage.setItem('workStart.2026-06-10', '09:00')

      await migrateLegacyDailyData()

      expect(localStorage.getItem('workStart.2026-06-10')).toBeNull()
    })

    it('関係のないキーは残す', async () => {
      localStorage.setItem('workStart.2026-06-10', '09:00')
      localStorage.setItem('unrelated.key', 'keep')

      await migrateLegacyDailyData()

      expect(localStorage.getItem('unrelated.key')).toBe('keep')
    })

    it('対象キーが無ければ書き込まず、フラグだけ立てる', async () => {
      await migrateLegacyDailyData()

      expect(importLegacy).not.toHaveBeenCalled()
      expect(localStorage.getItem(FLAG)).toBe('true')
    })
  })

  describe('書き込みに失敗したとき（データ消失の防止）', () => {
    beforeEach(() => {
      importLegacy.mockRejectedValue(new Error('disk full'))
      localStorage.setItem('workStart.2026-06-10', '09:00')
    })

    it('例外を呼び出し元へ伝える', async () => {
      const migrating = migrateLegacyDailyData()

      await expect(migrating).rejects.toThrow('disk full')
    })

    it('移行済みのフラグを立てない（次回の起動で再試行する）', async () => {
      await migrateLegacyDailyData().catch(() => {})

      expect(localStorage.getItem(FLAG)).toBeNull()
    })

    it('旧キーを消さない', async () => {
      await migrateLegacyDailyData().catch(() => {})

      expect(localStorage.getItem('workStart.2026-06-10')).toBe('09:00')
    })
  })

  it('移行済みなら何もしない', async () => {
    localStorage.setItem(FLAG, 'true')
    localStorage.setItem('workStart.2026-06-10', '09:00')

    await migrateLegacyDailyData()

    expect(importLegacy).not.toHaveBeenCalled()
  })
})
