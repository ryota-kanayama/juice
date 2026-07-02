import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeField } from './time-field'

function Harness({ initial = '14:19' }: { initial?: string }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <TimeField value={v} onChange={setV} aria-label="時刻" />
      <span data-testid="val">{v}</span>
    </>
  )
}

const val = () => screen.getByTestId('val').textContent
const hour = () => screen.getByLabelText('時') as HTMLInputElement
const minute = () => screen.getByLabelText('分') as HTMLInputElement

describe('TimeField', () => {
  it('value をゼロ詰め2桁で表示する', () => {
    render(<Harness initial="8:5" />)
    expect(hour().value).toBe('08')
    expect(minute().value).toBe('05')
  })

  it('時に2桁入力できる', () => {
    render(<Harness initial="00:00" />)
    fireEvent.change(hour(), { target: { value: '14' } })
    expect(val()).toBe('14:00')
  })

  it('時で先頭桁が3〜9なら即確定して分へ自動送り', () => {
    render(<Harness initial="00:00" />)
    fireEvent.change(hour(), { target: { value: '3' } })
    expect(val()).toBe('03:00')
    expect(minute()).toHaveFocus()
  })

  it('分で先頭桁が6〜9なら即確定', () => {
    render(<Harness initial="00:00" />)
    fireEvent.change(minute(), { target: { value: '7' } })
    expect(val()).toBe('00:07')
  })

  it('↑で時を+1する', () => {
    render(<Harness initial="14:19" />)
    fireEvent.keyDown(hour(), { key: 'ArrowUp' })
    expect(val()).toBe('15:19')
  })

  it('時の↑は23→00にラップする', () => {
    render(<Harness initial="23:00" />)
    fireEvent.keyDown(hour(), { key: 'ArrowUp' })
    expect(val()).toBe('00:00')
  })

  it('分の↓は00→59にラップする', () => {
    render(<Harness initial="14:00" />)
    fireEvent.keyDown(minute(), { key: 'ArrowDown' })
    expect(val()).toBe('14:59')
  })

  it('範囲外の2桁（時25）は最後の桁だけ残す', () => {
    render(<Harness initial="00:00" />)
    fireEvent.change(hour(), { target: { value: '25' } })
    expect(hour().value).toBe('5')
    expect(val()).toBe('05:00')
  })

  it('blur で単桁表示をゼロ詰めし、親の値と一致させる', () => {
    render(<Harness initial="00:00" />)
    fireEvent.change(hour(), { target: { value: '1' } })
    expect(hour().value).toBe('1')
    fireEvent.blur(hour())
    expect(hour().value).toBe('01')
    expect(val()).toBe('01:00')
  })
})
