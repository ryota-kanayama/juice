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
    expect(screen.getByText('00:02:05')).toBeInTheDocument()
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

  it('elapsedSecondsが3600の時、グラスが満杯（100%）になる', () => {
    const { container } = render(
      <ActiveTimer name="テスト" elapsedSeconds={3600} color="#FF9500" onStop={vi.fn()} />
    )
    // juice level要素の style を確認
    const juiceLevel = container.querySelector('[data-testid="juice-level"]')
    expect(juiceLevel).toHaveStyle({ height: '100%' })
  })
})
