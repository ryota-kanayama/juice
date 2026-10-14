// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionIntervalList } from './SessionIntervalList'
import type { IntervalDraft } from '../../domain/intervalDraft'

const row = (start: string, end: string, running = false): IntervalDraft => ({ start, end, running })

const one = [row('09:00', '10:30')]
const two = [row('09:00', '10:00'), row('13:00', '14:00')]

describe('SessionIntervalList', () => {
  it('区間の数だけ行を描く', () => {
    const { container } = render(<SessionIntervalList intervals={two} onChange={vi.fn()} />)

    expect(container.querySelectorAll('[data-interval-row]')).toHaveLength(2)
  })

  it('入力中の区間の合計を出す', () => {
    render(<SessionIntervalList intervals={two} onChange={vi.fn()} />)

    expect(screen.getByText('合計: 120分')).toBeInTheDocument()
  })

  it('開始時刻を変えると、その行だけを変えた区間を返す', () => {
    const onChange = vi.fn()
    const { container } = render(<SessionIntervalList intervals={two} onChange={onChange} />)
    const secondRow = container.querySelectorAll<HTMLElement>('[data-interval-row]')[1]

    fireEvent.change(within(within(secondRow).getByLabelText('開始時刻')).getByLabelText('時'), { target: { value: '12' } })

    expect(onChange).toHaveBeenCalledWith([row('09:00', '10:00'), row('12:00', '14:00')])
  })

  it('終了時刻を変えると、その行の終了だけを変える', () => {
    const onChange = vi.fn()
    render(<SessionIntervalList intervals={one} onChange={onChange} />)

    fireEvent.change(within(screen.getByLabelText('終了時刻')).getByLabelText('分'), { target: { value: '45' } })

    expect(onChange).toHaveBeenCalledWith([row('09:00', '10:45')])
  })

  it('「区間を追加」で末尾に空の行を足す', async () => {
    const onChange = vi.fn()
    render(<SessionIntervalList intervals={one} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '区間を追加' }))

    expect(onChange).toHaveBeenCalledWith([...one, row('', '')])
  })

  it('削除ボタンでその行を取り除く', async () => {
    const onChange = vi.fn()
    render(<SessionIntervalList intervals={two} onChange={onChange} />)

    await userEvent.click(screen.getAllByRole('button', { name: '区間を削除' })[0])

    expect(onChange).toHaveBeenCalledWith([row('13:00', '14:00')])
  })

  it('行が1つだけなら削除ボタンを出さない', () => {
    render(<SessionIntervalList intervals={one} onChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: '区間を削除' })).not.toBeInTheDocument()
  })

  describe('計測中の行', () => {
    it('終了時刻の代わりに「稼働中」と出す', () => {
      render(<SessionIntervalList intervals={[row('11:00', '', true)]} onChange={vi.fn()} />)

      expect(screen.getByText('稼働中')).toBeInTheDocument()
      expect(screen.queryByLabelText('終了時刻')).not.toBeInTheDocument()
    })

    it('削除ボタンを出さない', () => {
      render(<SessionIntervalList intervals={[row('09:00', '10:00'), row('11:00', '', true)]} onChange={vi.fn()} />)

      expect(screen.getAllByRole('button', { name: '区間を削除' })).toHaveLength(1)
    })
  })
})
