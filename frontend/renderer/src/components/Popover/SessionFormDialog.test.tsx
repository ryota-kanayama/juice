// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
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

type Props = ComponentProps<typeof SessionFormDialog>

function renderDialog(props: Partial<Props> = {}) {
  return render(
    <SessionFormDialog
      open
      title="タイマーを編集"
      submitLabel="保存"
      suggestions={EMPTY_SUGGESTIONS}
      values={intervalValues}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  )
}

const submitButton = () => screen.getByRole('button', { name: '保存' })

describe('SessionFormDialog', () => {
  describe('入力欄の切り替え', () => {
    it('区間がある記録は、区間の入力と合計を出す', () => {
      renderDialog({ values: intervalValues })

      expect(screen.getByText('合計: 90分')).toBeInTheDocument()
    })

    it('区間がある記録には「分」の入力を出さない', () => {
      renderDialog({ values: intervalValues })

      expect(screen.queryByPlaceholderText('分')).not.toBeInTheDocument()
    })

    it('時刻を持たない記録は「分」の入力を出す', () => {
      renderDialog({ values: legacyValues })

      expect(screen.getByPlaceholderText('分')).toBeInTheDocument()
    })

    it('「時刻を入力する」で、空の区間を1つ持つ入力に切り替える', async () => {
      const onChange = vi.fn()
      renderDialog({ values: legacyValues, onChange })

      await userEvent.click(screen.getByRole('button', { name: '時刻を入力する' }))

      expect(onChange).toHaveBeenCalledWith({ ...legacyValues, intervals: [{ start: '', end: '', running: false }] })
    })
  })

  describe('入力の反映', () => {
    it('作業名の入力を onChange で返す', () => {
      const onChange = vi.fn()
      renderDialog({ onChange })

      fireEvent.change(screen.getByPlaceholderText('作業名（必須）'), { target: { value: '実装' } })

      expect(onChange).toHaveBeenCalledWith({ ...intervalValues, name: '実装' })
    })

    it('区間の変更を onChange で返す', () => {
      const onChange = vi.fn()
      renderDialog({ onChange })

      fireEvent.change(screen.getAllByLabelText('時')[1], { target: { value: '11' } })

      expect(onChange).toHaveBeenCalledWith({ ...intervalValues, intervals: [{ start: '09:00', end: '11:30', running: false }] })
    })
  })

  describe('保存できるか', () => {
    it('作業名があり区間が正しければ押せる', () => {
      renderDialog({ values: intervalValues })

      expect(submitButton()).toBeEnabled()
    })

    it('作業名が空白だけなら押せない', () => {
      renderDialog({ values: { ...intervalValues, name: '  ' } })

      expect(submitButton()).toBeDisabled()
    })

    it('区間が不正（終了が開始より前）なら押せない', () => {
      renderDialog({ values: { ...intervalValues, intervals: [{ start: '10:00', end: '09:00', running: false }] } })

      expect(submitButton()).toBeDisabled()
    })

    it('時刻を持たない記録で分が空なら押せない', () => {
      renderDialog({ values: { ...legacyValues, totalTime: '' } })

      expect(submitButton()).toBeDisabled()
    })
  })

  describe('確定・取り消し', () => {
    it('保存ボタンで onSubmit を呼ぶ', async () => {
      const onSubmit = vi.fn()
      renderDialog({ onSubmit })

      await userEvent.click(submitButton())

      expect(onSubmit).toHaveBeenCalledOnce()
    })

    it('入力欄で Enter を押すと onSubmit を呼ぶ', () => {
      const onSubmit = vi.fn()
      renderDialog({ onSubmit })

      fireEvent.keyDown(screen.getByPlaceholderText('PJコード'), { key: 'Enter' })

      expect(onSubmit).toHaveBeenCalledOnce()
    })

    it('保存できない状態で Enter を押しても onSubmit を呼ばない', () => {
      const onSubmit = vi.fn()
      renderDialog({ values: { ...intervalValues, name: '' }, onSubmit })

      fireEvent.keyDown(screen.getByPlaceholderText('PJコード'), { key: 'Enter' })

      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('キャンセルで onClose を呼ぶ', async () => {
      const onClose = vi.fn()
      renderDialog({ onClose })

      await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

      expect(onClose).toHaveBeenCalledOnce()
    })
  })
})
