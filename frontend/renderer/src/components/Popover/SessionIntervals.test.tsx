// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionIntervals } from './SessionIntervals'
import type { Session } from '../../types/session'

const base: Session = {
  id: '1', taskId: '1', name: '企画書作業', projectCode: 'P001', workCategory: '設計',
  times: [{ startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:45:00' }],
  date: '2026-02-25', color: '#FF9500', totalTime: 45,
}

describe('SessionIntervals', () => {
  it('区間を HH:mm – HH:mm で並べる', () => {
    render(<SessionIntervals session={base} />)
    expect(screen.getByText('10:00 – 10:45')).toBeInTheDocument()
  })

  it('複数区間をすべて出す', () => {
    render(<SessionIntervals session={{ ...base, times: [
      { startTime: '2026-02-25T09:00:00', endTime: '2026-02-25T10:00:00' },
      { startTime: '2026-02-25T13:00:00', endTime: '2026-02-25T14:00:00' },
    ] }} />)
    expect(screen.getByText('09:00 – 10:00')).toBeInTheDocument()
    expect(screen.getByText('13:00 – 14:00')).toBeInTheDocument()
  })

  it('稼働中の区間は「稼働中」と出す', () => {
    render(<SessionIntervals session={{ ...base, times: [
      { startTime: '2026-02-25T11:00:00', endTime: null },
    ] }} />)
    expect(screen.getByText('11:00 – 稼働中')).toBeInTheDocument()
  })

  it('区間が無ければその旨を出す', () => {
    render(<SessionIntervals session={{ ...base, times: [] }} />)
    expect(screen.getByText('時刻の記録がありません')).toBeInTheDocument()
  })
})
