// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionIntervalList } from './SessionIntervalList'
import type { IntervalDraft } from '../../domain/intervalDraft'

const one: IntervalDraft[] = [{ start: '09:00', end: '10:30', running: false }]

describe('SessionIntervalList', () => {
  it('区間の数だけ行を描く', () => {
    const { container } = render(
      <SessionIntervalList
        intervals={[
          { start: '09:00', end: '10:00', running: false },
          { start: '13:00', end: '14:00', running: false },
        ]}
        onChange={vi.fn()}
      />
    )
    expect(container.querySelectorAll('[data-interval-row]')).toHaveLength(2)
  })

  it('合計を表示する', () => {
    render(<SessionIntervalList intervals={one} onChange={vi.fn()} />)
    expect(screen.getByText('合計: 90分')).toBeInTheDocument()
  })

  it('区間を追加すると空の行が足される', async () => {
    const onChange = vi.fn()
    render(<SessionIntervalList intervals={one} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '区間を追加' }))
    expect(onChange).toHaveBeenCalledWith([
      ...one,
      { start: '', end: '', running: false },
    ])
  })

  it('削除ボタンでその行が消える', async () => {
    const onChange = vi.fn()
    render(
      <SessionIntervalList
        intervals={[
          { start: '09:00', end: '10:00', running: false },
          { start: '13:00', end: '14:00', running: false },
        ]}
        onChange={onChange}
      />
    )
    await userEvent.click(screen.getAllByRole('button', { name: '区間を削除' })[0])
    expect(onChange).toHaveBeenCalledWith([{ start: '13:00', end: '14:00', running: false }])
  })

  it('行が1つだけのとき削除ボタンは出さない', () => {
    render(<SessionIntervalList intervals={one} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '区間を削除' })).not.toBeInTheDocument()
  })

  it('稼働中の行は終了時刻を編集させず「稼働中」と出す', () => {
    render(
      <SessionIntervalList
        intervals={[{ start: '11:00', end: '', running: true }]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('稼働中')).toBeInTheDocument()
    expect(screen.queryByLabelText('終了時刻')).not.toBeInTheDocument()
  })

  it('稼働中の行には削除ボタンを出さない', () => {
    render(
      <SessionIntervalList
        intervals={[
          { start: '09:00', end: '10:00', running: false },
          { start: '11:00', end: '', running: true },
        ]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getAllByRole('button', { name: '区間を削除' })).toHaveLength(1)
  })
})
