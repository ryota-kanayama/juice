// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReleaseNotesWindow } from './ReleaseNotesWindow'
import type { ReleaseNoteEntry } from '../../../../shared/types'

const getReleaseNotesCurrent = vi.fn()
const getReleaseNotesPending = vi.fn()
const markReleaseNotesSeen = vi.fn()
const closeReleaseNotesWindow = vi.fn()
vi.stubGlobal('bridge', { getReleaseNotesCurrent, getReleaseNotesPending, markReleaseNotesSeen, closeReleaseNotesWindow })

const entry = (version: string, body: string): ReleaseNoteEntry => ({ version, date: '2026-08-07', body })

async function renderWindow(mode: 'current' | 'pending') {
  const view = render(<ReleaseNotesWindow mode={mode} />)
  await act(async () => {})
  return view
}

beforeEach(() => {
  getReleaseNotesCurrent.mockReset().mockResolvedValue([])
  getReleaseNotesPending.mockReset().mockResolvedValue([])
  markReleaseNotesSeen.mockReset().mockResolvedValue(undefined)
  closeReleaseNotesWindow.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReleaseNotesWindow', () => {
  describe('更新後（current）', () => {
    it('バージョン・見出し・項目を出す', async () => {
      getReleaseNotesCurrent.mockResolvedValue([entry('2.2.0', '### ✨ 新機能\n\n- 何かができます')])

      await renderWindow('current')

      expect(screen.getByText('v2.2.0')).toBeInTheDocument()
      expect(screen.getByText('新機能')).toBeInTheDocument()
      expect(screen.getByText('何かができます')).toBeInTheDocument()
    })

    it('複数のバージョンを、渡された順（新しい順）に並べる', async () => {
      getReleaseNotesCurrent.mockResolvedValue([entry('2.2.0', '- 新しいほう'), entry('2.1.0', '- 古いほう')])

      await renderWindow('current')

      expect(screen.getAllByTestId('release-note-version').map(e => e.textContent)).toEqual(['v2.2.0', 'v2.1.0'])
    })

    it('中身を出せたら、見たことを記録する', async () => {
      getReleaseNotesCurrent.mockResolvedValue([entry('2.2.0', '- 何か')])

      await renderWindow('current')

      expect(markReleaseNotesSeen).toHaveBeenCalledOnce()
    })

    it('中身が空なら、その旨を出す', async () => {
      await renderWindow('current')

      expect(screen.getByText('表示できる変更点がありません')).toBeInTheDocument()
    })

    it('中身が空なら記録しない（記録すると次から出せなくなる）', async () => {
      await renderWindow('current')

      expect(markReleaseNotesSeen).not.toHaveBeenCalled()
    })

    it('取得に失敗したら、空とは別の文言を出す', async () => {
      getReleaseNotesCurrent.mockRejectedValue(new Error('取得できません'))

      await renderWindow('current')

      expect(screen.getByText(/変更点を読み込めませんでした/)).toBeInTheDocument()
      expect(screen.queryByText('表示できる変更点がありません')).not.toBeInTheDocument()
    })

    it('取得に失敗したら記録しない（次の起動でまた開く）', async () => {
      getReleaseNotesCurrent.mockRejectedValue(new Error('取得できません'))

      await renderWindow('current')

      expect(markReleaseNotesSeen).not.toHaveBeenCalled()
    })
  })

  describe('更新前（pending）', () => {
    it('次の更新のノートを出す', async () => {
      getReleaseNotesPending.mockResolvedValue([entry('2.3.0', '### ✨ 新機能\n\n- 何か')])

      await renderWindow('pending')

      expect(screen.getByText('v2.3.0')).toBeInTheDocument()
    })

    it('見たことは記録しない', async () => {
      getReleaseNotesPending.mockResolvedValue([entry('2.3.0', '- 何か')])

      await renderWindow('pending')

      expect(markReleaseNotesSeen).not.toHaveBeenCalled()
    })
  })

  it('「閉じる」でウィンドウを閉じる', async () => {
    await renderWindow('current')

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(closeReleaseNotesWindow).toHaveBeenCalledOnce()
  })
})
