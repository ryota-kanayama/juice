// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DailyDataProvider } from '../../daily/DailyDataContext'
import { CalendarWindow } from './CalendarWindow'
import { makeSession } from '../../test/factories'

const getSessions = vi.fn()
const backToMainPanel = vi.fn()
vi.stubGlobal('bridge', {
  getSessions,
  updateSession: vi.fn().mockResolvedValue(undefined),
  getDailyMonth: vi.fn().mockResolvedValue({ version: 1, days: {} }),
  setDailyDay: vi.fn().mockResolvedValue(undefined),
  getHolidays: vi.fn().mockResolvedValue({}),
  getMainProjectCode: vi.fn().mockResolvedValue(''),
  onSessionsChanged: () => () => {},
  onDailyChanged: () => () => {},
  backToMainPanel,
})

/** 2026-08-06（木）として描画し、読み込みを待つ */
async function renderWindow() {
  const view = render(<DailyDataProvider><CalendarWindow /></DailyDataProvider>)
  await act(async () => {})
  return view
}

const button = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0))
  getSessions.mockReset().mockResolvedValue([])
  backToMainPanel.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CalendarWindow', () => {
  it('最初は週表示', async () => {
    await renderWindow()

    expect(button('週')).toHaveAttribute('aria-pressed', 'true')
  })

  it('ツールバーに期間の見出しを出す', async () => {
    await renderWindow()

    // ミニカレンダーの月見出しも同じ文字列なので、ツールバーの <strong> に絞る
    expect(screen.getByText((content, el) => el?.tagName === 'STRONG' && content === '2026年8月')).toBeInTheDocument()
  })

  it('サイドバーにミニカレンダーを出す', async () => {
    await renderWindow()

    expect(button('前月')).toBeInTheDocument()
  })

  it('サイドバーに選択日（今日）の詳細を出す', async () => {
    await renderWindow()

    expect(screen.getByText('8月6日(木)')).toBeInTheDocument()
  })

  it('「月」で月表示に切り替える', async () => {
    await renderWindow()

    await userEvent.click(button('月'))

    expect(button('月')).toHaveAttribute('aria-pressed', 'true')
  })

  it('ミニカレンダーで日付を選ぶと、その日の詳細に切り替える', async () => {
    await renderWindow()

    await userEvent.click(button('8月4日'))

    expect(screen.getByText('8月4日(火)')).toBeInTheDocument()
  })

  it('記録がある日は、詳細にその日のセッションを出す', async () => {
    getSessions.mockResolvedValue([makeSession({ name: '設計', date: '2026-08-06' })])

    await renderWindow()

    expect(screen.getAllByText('設計').length).toBeGreaterThan(0)
  })

  it('「週次分析」で、選択日の週の分析を開く', async () => {
    await renderWindow()

    await userEvent.click(button('週次分析'))

    expect(await screen.findByRole('heading', { name: /^週次分析/ })).toBeInTheDocument()
  })

  it('「戻る」でポップオーバーへ戻る', async () => {
    await renderWindow()

    await userEvent.click(button('戻る'))

    expect(backToMainPanel).toHaveBeenCalledOnce()
  })
})
