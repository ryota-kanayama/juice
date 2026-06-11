import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveTimer } from './ActiveTimer'

describe('ActiveTimer', () => {
  it('タイマー名と経過時間を表示する', () => {
    render(
      <ActiveTimer
        name="企画書作業"
        elapsedSeconds={125}
        color="#FF9500"
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('企画書作業')).toBeInTheDocument()
    expect(screen.getByText('2分経過')).toBeInTheDocument()
  })

  it('停止ボタンを押すとonStopが呼ばれる', async () => {
    const onStop = vi.fn()
    render(
      <ActiveTimer name="テスト" elapsedSeconds={0} color="#FF9500" onStop={onStop} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(onStop).toHaveBeenCalled()
  })

  it('initialProjectCode と initialWorkCategory が input に反映される', () => {
    render(
      <ActiveTimer
        name="テスト"
        elapsedSeconds={0}
        color="#FF9500"
        onStop={vi.fn()}
        initialProjectCode="P001"
        initialWorkCategory="設計"
      />
    )
    expect(screen.getByRole('textbox', { name: 'PJコード' })).toHaveValue('P001')
    expect(screen.getByRole('textbox', { name: '作業区分' })).toHaveValue('設計')
  })

  it('elapsedSecondsが1500（デフォルト満杯秒数）の時、液面が最上部（surfaceY: 0）になる', () => {
    const { container } = render(
      <ActiveTimer name="テスト" elapsedSeconds={1500} color="#FF9500" onStop={vi.fn()} />
    )
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel?.getAttribute('d')).toMatch(/^M-120,0 /)
  })

  it('elapsedSecondsが0の時、液面が最下部（surfaceY: 120）になる', () => {
    const { container } = render(
      <ActiveTimer name="テスト" elapsedSeconds={0} color="#FF9500" onStop={vi.fn()} />
    )
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel?.getAttribute('d')).toMatch(/^M-120,120 /)
  })

  it('色キーを渡すと CSS 変数に解決される', () => {
    render(
      <ActiveTimer name="テスト" elapsedSeconds={0} color="strawberry" onStop={vi.fn()} />
    )
    expect(screen.getByTestId('juice-level')).toHaveStyle({ fill: 'var(--juice-strawberry)' })
  })

  it('PJコードの候補を選択すると入力に反映される', async () => {
    render(
      <ActiveTimer
        name="テスト"
        elapsedSeconds={60}
        color="#ff6b6b"
        onStop={vi.fn()}
        projectCodeSuggestions={['P001', 'P002']}
        workCategorySuggestions={['設計']}
      />
    )
    await userEvent.click(screen.getByLabelText('PJコード'))
    await userEvent.click(screen.getByText('P002'))
    expect(screen.getByLabelText('PJコード')).toHaveValue('P002')
  })

  it('作業区分の候補を選択すると入力に反映される', async () => {
    render(
      <ActiveTimer
        name="テスト"
        elapsedSeconds={60}
        color="#ff6b6b"
        onStop={vi.fn()}
        projectCodeSuggestions={[]}
        workCategorySuggestions={['設計', '会議']}
      />
    )
    await userEvent.click(screen.getByLabelText('作業区分'))
    await userEvent.click(screen.getByText('会議'))
    expect(screen.getByLabelText('作業区分')).toHaveValue('会議')
  })

  it('baseSecondsがあると累計込みの分数を表示する（25分 + 2分 = 27分）', () => {
    render(
      <ActiveTimer
        name="テスト"
        elapsedSeconds={120}
        baseSeconds={1500}
        color="#FF9500"
        onStop={vi.fn()}
      />
    )
    expect(screen.getByText('27分経過')).toBeInTheDocument()
  })

  it('baseSecondsはジュースの水位に影響しない（elapsed=0なら液面は最下部のまま）', () => {
    const { container } = render(
      <ActiveTimer
        name="テスト"
        elapsedSeconds={0}
        baseSeconds={1500}
        color="#FF9500"
        onStop={vi.fn()}
      />
    )
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel?.getAttribute('d')).toMatch(/^M-120,120 /)
  })

  it('fillSeconds=1800のとき、elapsedSeconds=1800で液面が最上部になる', () => {
    const { container } = render(
      <ActiveTimer name="テスト" elapsedSeconds={1800} fillSeconds={1800} color="#FF9500" onStop={vi.fn()} />
    )
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel?.getAttribute('d')).toMatch(/^M-120,0 /)
  })

  it('fillSeconds=1800のとき、elapsedSeconds=900で液面が50%（surfaceY: 60）になる', () => {
    const { container } = render(
      <ActiveTimer name="テスト" elapsedSeconds={900} fillSeconds={1800} color="#FF9500" onStop={vi.fn()} />
    )
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel?.getAttribute('d')).toMatch(/^M-120,60 /)
  })

  it('fillSeconds=0でもNaNにならず液面は最下部になる', () => {
    const { container } = render(
      <ActiveTimer name="テスト" elapsedSeconds={60} fillSeconds={0} color="#FF9500" onStop={vi.fn()} />
    )
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel?.getAttribute('d')).toMatch(/^M-120,120 /)
  })

  it('elapsedSecondsがfillSecondsを超えても液面は最上部のまま', () => {
    const { container } = render(
      <ActiveTimer name="テスト" elapsedSeconds={3000} color="#FF9500" onStop={vi.fn()} />
    )
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel?.getAttribute('d')).toMatch(/^M-120,0 /)
  })
})
