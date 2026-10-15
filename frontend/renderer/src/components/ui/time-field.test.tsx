import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeField } from './time-field'

/** 値を自分で持ち、親に渡った値を画面に出す */
function Harness({ initial }: { initial: string }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <TimeField value={v} onChange={setV} aria-label="時刻" />
      <span data-testid="val">{v}</span>
    </>
  )
}

const value = () => screen.getByTestId('val').textContent
const hour = () => screen.getByLabelText('時') as HTMLInputElement
const minute = () => screen.getByLabelText('分') as HTMLInputElement

describe('TimeField', () => {
  it('時・分をゼロ詰めの2桁で出す', () => {
    render(<Harness initial="8:5" />)

    expect([hour().value, minute().value]).toEqual(['08', '05'])
  })

  describe('時の入力', () => {
    it('2桁を入れるとその時刻にする', () => {
      render(<Harness initial="00:00" />)

      fireEvent.change(hour(), { target: { value: '14' } })

      expect(value()).toBe('14:00')
    })

    it('先頭の桁が 3〜9 ならその時点で確定する', () => {
      render(<Harness initial="00:00" />)

      fireEvent.change(hour(), { target: { value: '3' } })

      expect(value()).toBe('03:00')
    })

    it('先頭の桁で確定したら分の欄へ移る', () => {
      render(<Harness initial="00:00" />)

      fireEvent.change(hour(), { target: { value: '3' } })

      expect(minute()).toHaveFocus()
    })

    it('先頭の桁が 0〜2 なら分の欄へは移らない（2桁目を待つ）', () => {
      render(<Harness initial="00:00" />)

      fireEvent.change(hour(), { target: { value: '1' } })

      expect(minute()).not.toHaveFocus()
    })

    it('範囲外の2桁（25）は最後の桁だけ残す', () => {
      render(<Harness initial="00:00" />)

      fireEvent.change(hour(), { target: { value: '25' } })

      expect(value()).toBe('05:00')
    })

    it('欄を離れたら1桁の表示をゼロ詰めする', () => {
      render(<Harness initial="00:00" />)
      fireEvent.change(hour(), { target: { value: '1' } })

      fireEvent.blur(hour())

      expect(hour().value).toBe('01')
    })
  })

  describe('分の入力', () => {
    it('先頭の桁が 6〜9 ならその時点で確定する', () => {
      render(<Harness initial="00:00" />)

      fireEvent.change(minute(), { target: { value: '7' } })

      expect(value()).toBe('00:07')
    })
  })

  describe('矢印キー', () => {
    it.each([
      ['時の ↑ で +1', '14:19', '時', 'ArrowUp', '15:19'],
      ['時の ↓ で -1', '14:19', '時', 'ArrowDown', '13:19'],
      ['時の ↑ は 23 → 00', '23:00', '時', 'ArrowUp', '00:00'],
      ['分の ↑ で +1', '14:19', '分', 'ArrowUp', '14:20'],
      ['分の ↓ は 00 → 59', '14:00', '分', 'ArrowDown', '14:59'],
    ])('%s', (_label, initial, part, key, expected) => {
      render(<Harness initial={initial} />)

      fireEvent.keyDown(screen.getByLabelText(part), { key })

      expect(value()).toBe(expected)
    })
  })
})
