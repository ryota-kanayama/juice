// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { SessionItem } from './SessionItem'
import { interval, makeSession } from '../../test/factories'

const session = makeSession({
  name: '企画書作業',
  projectCode: 'P001',
  workCategory: '設計',
  times: [interval('2026-02-25T10:00:00', '2026-02-25T10:45:00')],
  totalTime: 45,
})

type Props = ComponentProps<typeof SessionItem>

function renderItem(props: Partial<Props> = {}) {
  return render(
    <ul>
      <SessionItem
        session={session}
        expanded={false}
        dragOver={false}
        onToggleExpand={vi.fn()}
        onEditStart={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDragEnd={vi.fn()}
        {...props}
      />
    </ul>,
  )
}

describe('SessionItem', () => {
  describe('表示', () => {
    it('作業名と合計を出す', () => {
      renderItem()

      expect(screen.getByText('企画書作業')).toBeInTheDocument()
      expect(screen.getByText('45分')).toBeInTheDocument()
    })

    it('PJコードも作業区分も無ければタグを出さない', () => {
      renderItem({ session: { ...session, projectCode: '', workCategory: '' } })

      expect(screen.queryByText('P001')).not.toBeInTheDocument()
    })

    it('折りたたみ中は区間を出さない', () => {
      const { container } = renderItem({ expanded: false })

      expect(container.querySelector('[data-session-intervals]')).toBeNull()
    })

    it('展開中は区間を出す', () => {
      renderItem({ expanded: true })

      expect(screen.getByText('10:00 – 10:45')).toBeInTheDocument()
    })
  })

  describe('展開の切り替え', () => {
    it('行をクリックすると切り替える', async () => {
      const onToggleExpand = vi.fn()
      renderItem({ onToggleExpand })

      await userEvent.click(screen.getByText('企画書作業'))

      expect(onToggleExpand).toHaveBeenCalledOnce()
    })

    it('ボタンを押したときは切り替えない', async () => {
      const onToggleExpand = vi.fn()
      renderItem({ onToggleExpand })

      await userEvent.click(screen.getByRole('button', { name: '編集' }))

      expect(onToggleExpand).not.toHaveBeenCalled()
    })
  })

  describe('編集ボタン', () => {
    it('押すと onEditStart を呼ぶ', async () => {
      const onEditStart = vi.fn()
      renderItem({ onEditStart })

      await userEvent.click(screen.getByRole('button', { name: '編集' }))

      expect(onEditStart).toHaveBeenCalledOnce()
    })

    it('行のダブルクリックでは編集を開かない', async () => {
      const onEditStart = vi.fn()
      renderItem({ onEditStart })

      await userEvent.dblClick(screen.getByText('企画書作業'))

      expect(onEditStart).not.toHaveBeenCalled()
    })
  })

  describe('「追加で注ぐ」ボタン', () => {
    it('押すとこのセッションで onStartMore を呼ぶ', async () => {
      const onStartMore = vi.fn()
      renderItem({ onStartMore })

      await userEvent.click(screen.getByRole('button', { name: '追加で注ぐ' }))

      expect(onStartMore).toHaveBeenCalledWith(session)
    })

    it('計測中は出さない', () => {
      renderItem({ onStartMore: vi.fn(), isRunning: true })

      expect(screen.queryByRole('button', { name: '追加で注ぐ' })).not.toBeInTheDocument()
    })
  })
})
