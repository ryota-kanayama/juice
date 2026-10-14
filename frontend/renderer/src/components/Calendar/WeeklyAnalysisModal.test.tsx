import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyAnalysisModal } from './WeeklyAnalysisModal'
import type { DayAnalysis, WeeklyAnalysis } from '../../hooks/useWeeklyAnalysis'

const useWeeklyAnalysis = vi.hoisted(() => vi.fn())
vi.mock('../../hooks/useWeeklyAnalysis', () => ({ useWeeklyAnalysis: (date: string | null) => useWeeklyAnalysis(date) }))

const day = (overrides: Partial<DayAnalysis> = {}): DayAnalysis => ({
  date: '2026-06-22',
  dayLabel: '月',
  scheduledMinutes: 480,
  actualMinutes: 480,
  nonProjectMinutes: 90,
  unexpectedMinutes: 30,
  utilizationRate: 100,
  isOff: false,
  ...overrides,
})

const analysis: WeeklyAnalysis = {
  weekLabel: '2026/06/22 の週',
  days: [day(), day({ date: '2026-06-23', dayLabel: '火', actualMinutes: null, utilizationRate: null, isOff: true })],
  weeklyAvgUtilization: 100,
}

/** 表の行（見出しのセルを除く値の並び）を返す */
function rowValues(label: string): string[] {
  const row = screen.getByText(label).closest('tr')!
  return within(row).getAllByRole('cell').slice(1).map(c => c.textContent ?? '')
}

beforeEach(() => {
  useWeeklyAnalysis.mockReset().mockReturnValue({ analysis, loading: false })
})

describe('WeeklyAnalysisModal', () => {
  it('日付が無ければ開かない', () => {
    render(<WeeklyAnalysisModal date={null} onClose={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('渡した日付の週を分析する', () => {
    render(<WeeklyAnalysisModal date="2026-06-24" onClose={vi.fn()} />)

    expect(useWeeklyAnalysis).toHaveBeenCalledWith('2026-06-24')
  })

  it('読み込み中はその旨を出す', () => {
    useWeeklyAnalysis.mockReturnValue({ analysis: null, loading: true })

    render(<WeeklyAnalysisModal date="2026-06-24" onClose={vi.fn()} />)

    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
  })

  it('見出しに週を出す', () => {
    render(<WeeklyAnalysisModal date="2026-06-24" onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '週次分析 — 2026/06/22 の週' })).toBeInTheDocument()
  })

  it('休みの日は所定を「休」にする', () => {
    render(<WeeklyAnalysisModal date="2026-06-24" onClose={vi.fn()} />)

    expect(rowValues('所定(分)')).toEqual(['480', '休', '—'])
  })

  it('値が無い日は「—」にする', () => {
    render(<WeeklyAnalysisModal date="2026-06-24" onClose={vi.fn()} />)

    expect(rowValues('実稼働(分)')).toEqual(['480', '—', '—'])
  })

  it('PJ外・想定外の分を日ごとに出す', () => {
    render(<WeeklyAnalysisModal date="2026-06-24" onClose={vi.fn()} />)

    expect([rowValues('PJ外(分)'), rowValues('想定外(分)')]).toEqual([['90', '90', '—'], ['30', '30', '—']])
  })

  it('稼働率は日ごとの値と週平均を % で出す', () => {
    render(<WeeklyAnalysisModal date="2026-06-24" onClose={vi.fn()} />)

    expect(rowValues('稼働率')).toEqual(['100%', '—', '100%'])
  })

  it('閉じると onClose を呼ぶ', async () => {
    const onClose = vi.fn()
    render(<WeeklyAnalysisModal date="2026-06-24" onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })
})
