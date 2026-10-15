import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkLocationSwitch } from './WorkLocationSwitch'

describe('WorkLocationSwitch', () => {
  it.each([
    ['office', '出社'],
    ['telework', 'テレワーク'],
  ] as const)('%s のとき、今の勤務場所を「%s」と出す', (location, label) => {
    render(<WorkLocationSwitch location={location} onSwitch={vi.fn()} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it.each([
    ['office', 'テレワークに切替', 'telework'],
    ['telework', '出社に切替', 'office'],
  ] as const)('%s のとき「%s」で %s に切り替える', (location, button, next) => {
    const onSwitch = vi.fn()
    render(<WorkLocationSwitch location={location} onSwitch={onSwitch} />)

    fireEvent.click(screen.getByRole('button', { name: button }))

    expect(onSwitch).toHaveBeenCalledWith(next)
  })
})
