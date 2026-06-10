import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuggestInput, type SuggestOption } from './suggest-input'

// 制御コンポーネントとして使うためのテストハーネス
function Harness({
  options,
  onSelectOption = () => {},
  onKeyDown,
}: {
  options: SuggestOption[]
  onSelectOption?: (o: SuggestOption) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [value, setValue] = useState('')
  return (
    <SuggestInput
      value={value}
      onChange={e => setValue(e.target.value)}
      options={options}
      onSelectOption={o => { setValue(o.value); onSelectOption(o) }}
      onKeyDown={onKeyDown}
      aria-label="テスト入力"
    />
  )
}

const OPTIONS: SuggestOption[] = [
  { value: '資料作成', sub: 'P001 / 設計' },
  { value: '資料レビュー', sub: 'P002 / 会議' },
  { value: '定例会議' },
]

describe('SuggestInput', () => {
  it('フォーカスすると候補が表示される', async () => {
    render(<Harness options={OPTIONS} />)
    await userEvent.click(screen.getByLabelText('テスト入力'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByText('P001 / 設計')).toBeInTheDocument()
  })

  it('入力すると部分一致で絞り込まれる', async () => {
    render(<Harness options={OPTIONS} />)
    await userEvent.type(screen.getByLabelText('テスト入力'), '資料')
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('候補は最大8件まで表示される', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ value: `候補${i}` }))
    render(<Harness options={many} />)
    await userEvent.click(screen.getByLabelText('テスト入力'))
    expect(screen.getAllByRole('option')).toHaveLength(8)
  })

  it('クリックで候補を選択すると onSelectOption が呼ばれる', async () => {
    const onSelect = vi.fn()
    render(<Harness options={OPTIONS} onSelectOption={onSelect} />)
    await userEvent.click(screen.getByLabelText('テスト入力'))
    await userEvent.click(screen.getByText('資料レビュー'))
    expect(onSelect).toHaveBeenCalledWith({ value: '資料レビュー', sub: 'P002 / 会議' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('↓キーと Enter で候補を選択でき、Enter は伝播しない', async () => {
    const onSelect = vi.fn()
    const onKeyDown = vi.fn()
    render(<Harness options={OPTIONS} onSelectOption={onSelect} onKeyDown={onKeyDown} />)
    await userEvent.click(screen.getByLabelText('テスト入力'))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ value: '資料レビュー', sub: 'P002 / 会議' })
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('ハイライトなしの Enter は onKeyDown へ伝播する（フォーム送信を妨げない）', async () => {
    const onKeyDown = vi.fn()
    render(<Harness options={OPTIONS} onKeyDown={onKeyDown} />)
    await userEvent.click(screen.getByLabelText('テスト入力'))
    await userEvent.keyboard('{Enter}')
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('Escape で候補が閉じ、onKeyDown へは伝播しない', async () => {
    const onKeyDown = vi.fn()
    render(<Harness options={OPTIONS} onKeyDown={onKeyDown} />)
    await userEvent.click(screen.getByLabelText('テスト入力'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('候補が0件のときはリストを表示しない', async () => {
    render(<Harness options={[]} />)
    await userEvent.click(screen.getByLabelText('テスト入力'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('IME 変換中の Enter は候補確定も伝播もしない', async () => {
    const onSelect = vi.fn()
    const onKeyDown = vi.fn()
    render(<Harness options={OPTIONS} onSelectOption={onSelect} onKeyDown={onKeyDown} />)
    const input = screen.getByLabelText('テスト入力')
    await userEvent.click(input)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('dropUp 指定で候補リストが上方向に開く', async () => {
    render(
      <SuggestInput
        value=""
        onChange={() => {}}
        options={OPTIONS}
        onSelectOption={() => {}}
        dropUp
        aria-label="テスト入力"
      />
    )
    await userEvent.click(screen.getByLabelText('テスト入力'))
    expect(screen.getByRole('listbox').className).toContain('bottom-full')
  })

  it('ドロップダウンの開閉が onOpenChange で通知される', async () => {
    const onOpenChange = vi.fn()
    render(
      <SuggestInput
        value=""
        onChange={() => {}}
        options={OPTIONS}
        onSelectOption={() => {}}
        onOpenChange={onOpenChange}
        aria-label="テスト入力"
      />
    )
    await userEvent.click(screen.getByLabelText('テスト入力'))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
})
