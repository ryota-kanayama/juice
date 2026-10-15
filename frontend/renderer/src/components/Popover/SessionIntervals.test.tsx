// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionIntervals } from './SessionIntervals'
import { interval, makeSession } from '../../test/factories'

describe('SessionIntervals', () => {
  it('区間を「HH:mm – HH:mm」で出す', () => {
    const session = makeSession({ times: [interval('2026-02-25T10:00:00', '2026-02-25T10:45:00')] })

    render(<SessionIntervals session={session} />)

    expect(screen.getByText('10:00 – 10:45')).toBeInTheDocument()
  })

  it('複数の区間をすべて出す', () => {
    const session = makeSession({
      times: [
        interval('2026-02-25T09:00:00', '2026-02-25T10:00:00'),
        interval('2026-02-25T13:00:00', '2026-02-25T14:00:00'),
      ],
    })

    render(<SessionIntervals session={session} />)

    expect(screen.getByText('09:00 – 10:00')).toBeInTheDocument()
    expect(screen.getByText('13:00 – 14:00')).toBeInTheDocument()
  })

  it('計測中の区間は終了の代わりに「稼働中」と出す', () => {
    const session = makeSession({ times: [interval('2026-02-25T11:00:00', null)] })

    render(<SessionIntervals session={session} />)

    expect(screen.getByText('11:00 – 稼働中')).toBeInTheDocument()
  })

  it('区間が無ければその旨を出す', () => {
    render(<SessionIntervals session={makeSession({ times: [] })} />)

    expect(screen.getByText('時刻の記録がありません')).toBeInTheDocument()
  })
})
