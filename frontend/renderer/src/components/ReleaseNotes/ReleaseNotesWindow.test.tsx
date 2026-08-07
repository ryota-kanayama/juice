// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReleaseNotesWindow } from './ReleaseNotesWindow'

const getReleaseNotesCurrent = vi.fn()
const getReleaseNotesPending = vi.fn()
const markReleaseNotesSeen = vi.fn().mockResolvedValue(undefined)
const closeReleaseNotesWindow = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('bridge', {
  getReleaseNotesCurrent,
  getReleaseNotesPending,
  markReleaseNotesSeen,
  closeReleaseNotesWindow,
})

const entry = (version: string, body: string) => ({ version, date: '2026-08-07', body })

beforeEach(() => {
  vi.clearAllMocks()
  markReleaseNotesSeen.mockResolvedValue(undefined)
  closeReleaseNotesWindow.mockResolvedValue(undefined)
})

describe('ReleaseNotesWindow', () => {
  it('current では見出しと項目を描画する', async () => {
    getReleaseNotesCurrent.mockResolvedValue([entry('2.2.0', '### ✨ 新機能\n\n- 何かができます')])
    render(<ReleaseNotesWindow mode="current" />)
    expect(await screen.findByText('新機能')).toBeInTheDocument()
    expect(screen.getByText('何かができます')).toBeInTheDocument()
    expect(screen.getByText('v2.2.0')).toBeInTheDocument()
  })

  it('current で中身を描画できたら見たことを記録する', async () => {
    getReleaseNotesCurrent.mockResolvedValue([entry('2.2.0', '### ✨ 新機能\n\n- 何か')])
    render(<ReleaseNotesWindow mode="current" />)
    await screen.findByText('新機能')
    await waitFor(() => expect(markReleaseNotesSeen).toHaveBeenCalledTimes(1))
  })

  it('pending では見たことを記録しない', async () => {
    getReleaseNotesPending.mockResolvedValue([entry('2.3.0', '### ✨ 新機能\n\n- 何か')])
    render(<ReleaseNotesWindow mode="pending" />)
    await screen.findByText('新機能')
    expect(markReleaseNotesSeen).not.toHaveBeenCalled()
  })

  it('複数バージョンを新しい順に並べ、それぞれに見出しを付ける', async () => {
    getReleaseNotesCurrent.mockResolvedValue([
      entry('2.2.0', '### ✨ 新機能\n\n- 新しいほう'),
      entry('2.1.0', '### 🐛 修正\n\n- 古いほう'),
    ])
    render(<ReleaseNotesWindow mode="current" />)
    await screen.findByText('v2.2.0')
    const headings = screen.getAllByTestId('release-note-version').map(e => e.textContent)
    expect(headings).toEqual(['v2.2.0', 'v2.1.0'])
  })

  it('空のときは何も無い旨を出し、記録もしない', async () => {
    getReleaseNotesCurrent.mockResolvedValue([])
    render(<ReleaseNotesWindow mode="current" />)
    expect(await screen.findByText('表示できる変更点がありません')).toBeInTheDocument()
    expect(markReleaseNotesSeen).not.toHaveBeenCalled()
  })

  it('閉じるボタンでウィンドウを閉じる', async () => {
    getReleaseNotesCurrent.mockResolvedValue([entry('2.2.0', '- 何か')])
    render(<ReleaseNotesWindow mode="current" />)
    await screen.findByText('何か')
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(closeReleaseNotesWindow).toHaveBeenCalled()
  })
})
