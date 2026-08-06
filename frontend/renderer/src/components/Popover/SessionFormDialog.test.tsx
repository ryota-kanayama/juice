// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionFormDialog, type SessionFormValues } from './SessionFormDialog'
import { EMPTY_SUGGESTIONS } from '../../domain/suggestions'

const intervalValues: SessionFormValues = {
  name: '設計',
  projectCode: 'P001',
  workCategory: '開発',
  intervals: [{ start: '09:00', end: '10:30', running: false }],
  totalTime: '',
}

const legacyValues: SessionFormValues = {
  name: '設計',
  projectCode: '',
  workCategory: '',
  intervals: null,
  totalTime: '45',
}

const baseProps = {
  open: true,
  title: 'タイマーを編集',
  submitLabel: '保存',
  suggestions: EMPTY_SUGGESTIONS,
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  onClose: vi.fn(),
}

describe('SessionFormDialog', () => {
  it('区間モードでは区間リストを出す', () => {
    render(<SessionFormDialog {...baseProps} values={intervalValues} />)
    expect(screen.getByText('合計: 90分')).toBeInTheDocument()
  })

  it('区間モードでは「分」入力を出さない', () => {
    render(<SessionFormDialog {...baseProps} values={intervalValues} />)
    expect(screen.queryByPlaceholderText('分')).not.toBeInTheDocument()
  })

  it('レガシーモードでは「分」入力を出す', () => {
    render(<SessionFormDialog {...baseProps} values={legacyValues} />)
    expect(screen.getByPlaceholderText('分')).toBeInTheDocument()
  })

  it('レガシーモードで「区間を追加」を押すと区間モードへ切り替わる', async () => {
    const onChange = vi.fn()
    render(<SessionFormDialog {...baseProps} values={legacyValues} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '時刻を入力する' }))
    expect(onChange).toHaveBeenCalledWith({
      ...legacyValues,
      intervals: [{ start: '', end: '', running: false }],
    })
  })

  it('区間が不正なら保存できない', () => {
    render(
      <SessionFormDialog
        {...baseProps}
        values={{ ...intervalValues, intervals: [{ start: '10:00', end: '09:00', running: false }] }}
      />
    )
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('区間が正しければ保存できる', () => {
    render(<SessionFormDialog {...baseProps} values={intervalValues} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('作業名が空なら保存できない', () => {
    render(<SessionFormDialog {...baseProps} values={{ ...intervalValues, name: '  ' }} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('レガシーモードで分が空なら保存できない', () => {
    render(<SessionFormDialog {...baseProps} values={{ ...legacyValues, totalTime: '' }} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('保存ボタンで onSubmit が呼ばれる', async () => {
    const onSubmit = vi.fn()
    render(<SessionFormDialog {...baseProps} values={intervalValues} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSubmit).toHaveBeenCalled()
  })
})
