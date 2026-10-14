import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { WorkStartOverlay } from './WorkStartOverlay'

type Props = ComponentProps<typeof WorkStartOverlay>

function renderOverlay(props: Partial<Props> = {}) {
  return render(<WorkStartOverlay date="2026-06-10" onStart={vi.fn()} onTeleworkStart={vi.fn()} {...props} />)
}

function setTime(hh: string, mm: string): void {
  fireEvent.change(screen.getByLabelText('時'), { target: { value: hh } })
  fireEvent.change(screen.getByLabelText('分'), { target: { value: mm } })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('WorkStartOverlay', () => {
  it('日付を曜日付きで出す', () => {
    renderOverlay({ date: '2026-06-10' })

    expect(screen.getByText('2026年6月10日(水)')).toBeInTheDocument()
  })

  it('開始時刻には今の時刻を入れておく', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 10, 8, 47))

    renderOverlay()

    expect([screen.getByLabelText('時'), screen.getByLabelText('分')].map(el => (el as HTMLInputElement).value)).toEqual(['08', '47'])
  })

  it('「業務開始」で、入力した時刻と出社（在宅でない）を渡す', () => {
    const onStart = vi.fn()
    renderOverlay({ onStart })
    setTime('09', '30')

    fireEvent.click(screen.getByRole('button', { name: '業務開始' }))

    expect(onStart).toHaveBeenCalledWith('09:30', false)
  })

  it('出社で始めたらテレワーク開始の通知はしない', () => {
    const onTeleworkStart = vi.fn()
    renderOverlay({ onTeleworkStart })

    fireEvent.click(screen.getByRole('button', { name: '業務開始' }))

    expect(onTeleworkStart).not.toHaveBeenCalled()
  })

  describe('在宅をオンにして始めたとき', () => {
    it('在宅として onStart を呼ぶ', async () => {
      const onStart = vi.fn()
      renderOverlay({ onStart })
      await userEvent.click(screen.getByRole('switch', { name: '在宅' }))
      setTime('09', '30')

      fireEvent.click(screen.getByRole('button', { name: '業務開始' }))

      expect(onStart).toHaveBeenCalledWith('09:30', true)
    })

    it('テレワーク開始を通知する', async () => {
      const onTeleworkStart = vi.fn()
      renderOverlay({ onTeleworkStart })
      await userEvent.click(screen.getByRole('switch', { name: '在宅' }))

      fireEvent.click(screen.getByRole('button', { name: '業務開始' }))

      expect(onTeleworkStart).toHaveBeenCalledOnce()
    })
  })

  it('「業務開始」ボタンにツアー用のアンカーを付ける', () => {
    renderOverlay()

    expect(screen.getByRole('button', { name: '業務開始' })).toHaveAttribute('data-tour', 'work-start')
  })
})
