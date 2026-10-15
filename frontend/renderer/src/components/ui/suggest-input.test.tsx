import { describe, it, expect, vi } from 'vitest'
import { useState, type ComponentProps } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuggestInput, type SuggestOption } from './suggest-input'

type Props = ComponentProps<typeof SuggestInput>

/** 入力値を自分で持つ制御コンポーネントとして描く */
function Harness(props: Partial<Props>) {
  const [value, setValue] = useState('')
  return (
    <SuggestInput
      value={value}
      onChange={e => setValue(e.target.value)}
      options={OPTIONS}
      aria-label="テスト入力"
      {...props}
      onSelectOption={o => { setValue(o.value); props.onSelectOption?.(o) }}
    />
  )
}

const OPTIONS: SuggestOption[] = [
  { value: '資料作成', sub: 'P001 / 設計' },
  { value: '資料レビュー', sub: 'P002 / 会議' },
  { value: '定例会議' },
]

const input = () => screen.getByLabelText('テスト入力')
const listbox = () => screen.queryByRole('listbox')

async function openList(): Promise<void> {
  await userEvent.click(input())
}

describe('SuggestInput', () => {
  describe('開く・閉じる', () => {
    it('クリックすると候補をすべて出す', async () => {
      render(<Harness />)

      await openList()

      expect(screen.getAllByRole('option')).toHaveLength(3)
    })

    it('候補の補足（PJコード / 作業区分）も出す', async () => {
      render(<Harness />)

      await openList()

      expect(screen.getByText('P001 / 設計')).toBeInTheDocument()
    })

    it('autoFocus でフォーカスされただけでは開かない', () => {
      render(<Harness autoFocus />)

      expect(input()).toHaveFocus()
      expect(listbox()).not.toBeInTheDocument()
    })

    it('閉じているときに ↓ を押すと開き、先頭を選んだ状態にする', async () => {
      render(<Harness />)
      input().focus()

      await userEvent.keyboard('{ArrowDown}')

      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('Escape で閉じる', async () => {
      render(<Harness />)
      await openList()

      await userEvent.keyboard('{Escape}')

      expect(listbox()).not.toBeInTheDocument()
    })

    it('候補が0件なら開かない', async () => {
      render(<Harness options={[]} />)

      await openList()

      expect(listbox()).not.toBeInTheDocument()
    })

    it('dropUp を指定すると上向きに開く', async () => {
      render(<Harness dropUp />)

      await openList()

      expect(listbox()).toHaveClass('bottom-full')
    })
  })

  describe('絞り込み', () => {
    it('入力した文字を含む候補だけを出す', async () => {
      render(<Harness />)

      await userEvent.type(input(), '資料')

      expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
        expect.stringContaining('資料作成'),
        expect.stringContaining('資料レビュー'),
      ])
    })

    it('候補は最大8件まで出す', async () => {
      render(<Harness options={Array.from({ length: 12 }, (_, i) => ({ value: `候補${i}` }))} />)

      await openList()

      expect(screen.getAllByRole('option')).toHaveLength(8)
    })
  })

  describe('選ぶ', () => {
    it('クリックした候補で onSelectOption を呼ぶ', async () => {
      const onSelectOption = vi.fn()
      render(<Harness onSelectOption={onSelectOption} />)
      await openList()

      await userEvent.click(screen.getByText('資料レビュー'))

      expect(onSelectOption).toHaveBeenCalledWith({ value: '資料レビュー', sub: 'P002 / 会議' })
    })

    it('選んだら閉じる', async () => {
      render(<Harness />)
      await openList()

      await userEvent.click(screen.getByText('資料レビュー'))

      expect(listbox()).not.toBeInTheDocument()
    })

    it('↓ で選んで Enter で確定できる', async () => {
      const onSelectOption = vi.fn()
      render(<Harness onSelectOption={onSelectOption} />)
      await openList()

      await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

      expect(onSelectOption).toHaveBeenCalledWith({ value: '資料レビュー', sub: 'P002 / 会議' })
    })
  })

  describe('キー入力の伝播', () => {
    it('候補を確定した Enter は onKeyDown へ渡さない（フォームを送信しない）', async () => {
      const onKeyDown = vi.fn()
      render(<Harness onKeyDown={onKeyDown} />)
      await openList()

      await userEvent.keyboard('{ArrowDown}{Enter}')

      expect(onKeyDown).not.toHaveBeenCalled()
    })

    it('候補を選んでいないときの Enter は onKeyDown へ渡す（フォーム送信を妨げない）', async () => {
      const onKeyDown = vi.fn()
      render(<Harness onKeyDown={onKeyDown} />)
      await openList()

      await userEvent.keyboard('{Enter}')

      expect(onKeyDown).toHaveBeenCalled()
    })

    it('候補を閉じた Escape は onKeyDown へ渡さない（ダイアログを閉じない）', async () => {
      const onKeyDown = vi.fn()
      render(<Harness onKeyDown={onKeyDown} />)
      await openList()

      await userEvent.keyboard('{Escape}')

      expect(onKeyDown).not.toHaveBeenCalled()
    })

    it('IME の変換中の Enter は、確定にも伝播にも使わない', async () => {
      const onSelectOption = vi.fn()
      const onKeyDown = vi.fn()
      render(<Harness onSelectOption={onSelectOption} onKeyDown={onKeyDown} />)
      await openList()

      fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229, isComposing: true })

      expect(onSelectOption).not.toHaveBeenCalled()
      expect(onKeyDown).not.toHaveBeenCalled()
    })
  })

  describe('onOpenChange', () => {
    it('開いたら true を知らせる', async () => {
      const onOpenChange = vi.fn()
      render(<Harness onOpenChange={onOpenChange} />)

      await openList()

      expect(onOpenChange).toHaveBeenLastCalledWith(true)
    })

    it('Escape で閉じたら false を知らせる', async () => {
      const onOpenChange = vi.fn()
      render(<Harness onOpenChange={onOpenChange} />)
      await openList()

      await userEvent.keyboard('{Escape}')

      expect(onOpenChange).toHaveBeenLastCalledWith(false)
    })

    it('絞り込みで候補が0件になったら false を知らせる', async () => {
      const onOpenChange = vi.fn()
      render(<Harness onOpenChange={onOpenChange} />)
      await openList()

      await userEvent.type(input(), 'zzz')

      expect(onOpenChange).toHaveBeenLastCalledWith(false)
    })
  })
})
