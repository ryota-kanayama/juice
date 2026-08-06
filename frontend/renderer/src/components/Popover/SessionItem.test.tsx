// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionItem } from './SessionItem'
import type { Session } from '../../types/session'

const session: Session = {
  id: '1', taskId: '1', name: '企画書作業', projectCode: 'P001', workCategory: '設計',
  times: [{ startTime: '2026-02-25T10:00:00', endTime: '2026-02-25T10:45:00' }],
  date: '2026-02-25', color: '#FF9500', totalTime: 45,
}

const baseProps = {
  session,
  dragOver: false,
  onToggleExpand: vi.fn(),
  onEditStart: vi.fn(),
  onContextMenu: vi.fn(),
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDragLeave: vi.fn(),
  onDragEnd: vi.fn(),
}

describe('SessionItem', () => {
  it('折りたたみ時は区間を出さない', () => {
    const { container } = render(<ul><SessionItem {...baseProps} expanded={false} /></ul>)
    expect(container.querySelector('[data-session-intervals]')).toBeNull()
  })

  it('折りたたみ時も作業名と合計は出る', () => {
    render(<ul><SessionItem {...baseProps} expanded={false} /></ul>)
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
    expect(screen.getByText('45分')).toBeInTheDocument()
  })

  it('展開すると区間が出る', () => {
    render(<ul><SessionItem {...baseProps} expanded /></ul>)
    expect(screen.getByText('10:00 – 10:45')).toBeInTheDocument()
  })
})
