import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TimerPage } from './App'
import type { SessionsState } from './hooks/useSessions'
import { dailyStore } from './dailyStore'

function stubSessions(): SessionsState {
  return {
    today: '2026-06-10',
    todaySessions: [],
    upsertToday: vi.fn(),
    applyStartMore: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    startTelework: vi.fn(),
  }
}

describe('TimerPage — 業務開始オーバーレイ', () => {
  beforeEach(() => localStorage.clear())

  it('業務開始前はオーバーレイを表示し、タイマー作成フォームを隠す', () => {
    render(<TimerPage sessions={stubSessions()} />)
    expect(screen.getByRole('button', { name: '業務開始' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('どんなジュースにしますか？')).not.toBeInTheDocument()
  })

  it('業務開始済みならタイマー作成フォームを表示し、オーバーレイを隠す', () => {
    dailyStore.setWorkStart('2026-06-10', '09:00')
    render(<TimerPage sessions={stubSessions()} />)
    expect(screen.getByPlaceholderText('どんなジュースにしますか？')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '業務開始' })).not.toBeInTheDocument()
  })
})
