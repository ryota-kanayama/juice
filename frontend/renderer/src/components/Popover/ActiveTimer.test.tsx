import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { ActiveTimer } from './ActiveTimer'

type Props = ComponentProps<typeof ActiveTimer>

function renderTimer(props: Partial<Props> = {}) {
  return render(<ActiveTimer name="テスト" elapsedSeconds={0} color="#FF9500" onStop={vi.fn()} {...props} />)
}

/** 液面の y 座標（0 = 満杯、120 = 空）を描画パスから読む */
function surfaceY(): number {
  const d = screen.getByTestId('juice-level').getAttribute('d') ?? ''
  return Number(/^M-120,([\d.]+) /.exec(d)?.[1])
}

describe('ActiveTimer', () => {
  describe('表示', () => {
    it('作業名を出す', () => {
      renderTimer({ name: '企画書作業' })

      expect(screen.getByText('企画書作業')).toBeInTheDocument()
    })

    it('経過時間を分で出す（125秒 → 2分）', () => {
      renderTimer({ elapsedSeconds: 125 })

      expect(screen.getByText('2分経過')).toBeInTheDocument()
    })

    it('延長中は累計を足した分を出す（25分 + 2分 = 27分）', () => {
      renderTimer({ elapsedSeconds: 120, baseSeconds: 1500 })

      expect(screen.getByText('27分経過')).toBeInTheDocument()
    })

    it('色キーを CSS 変数に解決して塗る', () => {
      renderTimer({ color: 'strawberry' })

      expect(screen.getByTestId('juice-level')).toHaveStyle({ fill: 'var(--juice-strawberry)' })
    })
  })

  describe('ジュースの水位', () => {
    it.each([
      ['0秒なら空', 0, undefined, 120],
      ['既定の満杯秒数（1500秒）で満杯', 1500, undefined, 0],
      ['満杯秒数を超えても満杯のまま', 3000, undefined, 0],
      ['fillSeconds=1800 の半分（900秒）で半分', 900, 1800, 60],
      ['fillSeconds=1800 なら 1800秒で満杯', 1800, 1800, 0],
      ['fillSeconds=0 でも壊れず空', 60, 0, 120],
    ])('%s', (_label, elapsedSeconds, fillSeconds, expected) => {
      renderTimer({ elapsedSeconds, fillSeconds })

      expect(surfaceY()).toBe(expected)
    })

    it('延長の累計（baseSeconds）は水位に含めない', () => {
      renderTimer({ elapsedSeconds: 0, baseSeconds: 1500 })

      expect(surfaceY()).toBe(120)
    })

    it('juiceSeconds を渡したら、経過秒ではなくそちらで水位を決める', () => {
      renderTimer({ elapsedSeconds: 3000, juiceSeconds: 0, fillSeconds: 1800 })

      expect(surfaceY()).toBe(120)
    })

    it('juiceSeconds を渡しても、表示する経過時間は変わらない', () => {
      renderTimer({ elapsedSeconds: 3000, juiceSeconds: 0, fillSeconds: 1800 })

      expect(screen.getByText('50分経過')).toBeInTheDocument()
    })
  })

  describe('PJコード・作業区分', () => {
    it('初期値を入力欄に入れておく', () => {
      renderTimer({ initialProjectCode: 'P001', initialWorkCategory: '設計' })

      expect(screen.getByRole('textbox', { name: 'PJコード' })).toHaveValue('P001')
      expect(screen.getByRole('textbox', { name: '作業区分' })).toHaveValue('設計')
    })

    it('PJコードの候補を選ぶと入力欄に入る', async () => {
      renderTimer({ projectCodeSuggestions: ['P001', 'P002'] })
      await userEvent.click(screen.getByLabelText('PJコード'))

      await userEvent.click(screen.getByText('P002'))

      expect(screen.getByLabelText('PJコード')).toHaveValue('P002')
    })

    it('作業区分の候補を選ぶと入力欄に入る', async () => {
      renderTimer({ workCategorySuggestions: ['設計', '会議'] })
      await userEvent.click(screen.getByLabelText('作業区分'))

      await userEvent.click(screen.getByText('会議'))

      expect(screen.getByLabelText('作業区分')).toHaveValue('会議')
    })
  })

  describe('やめる', () => {
    it('入力中の PJコード・作業区分を添えて onStop を呼ぶ', async () => {
      const onStop = vi.fn()
      renderTimer({ onStop, initialProjectCode: 'P001' })
      await userEvent.type(screen.getByLabelText('作業区分'), '実装')

      await userEvent.click(screen.getByRole('button', { name: 'やめる' }))

      expect(onStop).toHaveBeenCalledWith('P001', '実装')
    })
  })

  describe('休憩ボタン', () => {
    it('onBreak を渡すと「休憩」を出し、押すと onBreak を呼ぶ', async () => {
      const onBreak = vi.fn()
      renderTimer({ onBreak, isOnBreak: false })

      await userEvent.click(screen.getByRole('button', { name: '休憩' }))

      expect(onBreak).toHaveBeenCalledOnce()
    })

    it('休憩中は「休憩終了」を出す', () => {
      renderTimer({ onBreak: vi.fn(), isOnBreak: true })

      expect(screen.getByRole('button', { name: '休憩終了' })).toBeInTheDocument()
    })

    it('onBreak を渡さなければ出さない', () => {
      renderTimer()

      expect(screen.queryByRole('button', { name: '休憩' })).not.toBeInTheDocument()
    })
  })
})
