import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkLocationSwitch } from './WorkLocationSwitch'

describe('WorkLocationSwitch', () => {
  it('出社中はテレワークへ切替えるボタンを出す', () => {
    const onSwitch = vi.fn()
    render(<WorkLocationSwitch location="office" onSwitch={onSwitch} />)
    expect(screen.getByText('出社')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'テレワークに切替' }))
    expect(onSwitch).toHaveBeenCalledWith('telework')
  })

  it('テレワーク中は出社へ切替えるボタンを出す', () => {
    const onSwitch = vi.fn()
    render(<WorkLocationSwitch location="telework" onSwitch={onSwitch} />)
    expect(screen.getByText('テレワーク')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '出社に切替' }))
    expect(onSwitch).toHaveBeenCalledWith('office')
  })
})
