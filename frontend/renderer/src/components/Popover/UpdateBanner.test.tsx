import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateBanner } from './UpdateBanner'
import type { UpdateState } from '../../hooks/useUpdate'
import type { UpdateInfo } from '../../../../shared/types'

const openPending = vi.hoisted(() => vi.fn())
vi.mock('../../repositories/releaseNotesRepository', () => ({
  releaseNotesRepository: { openPending: () => openPending() },
}))

const info: UpdateInfo = {
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  hasUpdate: true,
  releaseUrl: 'u',
  downloadUrl: 'd',
  assetName: 'a.dmg',
  notes: '',
}

function state(overrides: Partial<UpdateState>): UpdateState {
  return {
    phase: 'idle',
    info,
    percent: 0,
    error: null,
    currentVersion: '',
    checking: false,
    checkedUpToDate: false,
    check: vi.fn(),
    install: vi.fn(),
    confirmingInstall: false,
    confirmInstall: vi.fn(),
    cancelInstall: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  openPending.mockReset().mockResolvedValue(undefined)
})

describe('UpdateBanner', () => {
  it.each([
    ['idle', state({ phase: 'idle' })],
    ['error', state({ phase: 'error' })],
    ['更新情報が無い', state({ phase: 'available', info: null })],
  ])('%s なら何も出さない', (_label, update) => {
    const { container } = render(<UpdateBanner update={update} />)

    expect(container).toBeEmptyDOMElement()
  })

  describe('更新がある（available）', () => {
    it('新しいバージョンを知らせる', () => {
      render(<UpdateBanner update={state({ phase: 'available' })} />)

      expect(screen.getByText('新しいバージョン v1.1.0 があります')).toBeInTheDocument()
    })

    it('バージョンの文言を押すと、次の更新の変更点を開く', () => {
      render(<UpdateBanner update={state({ phase: 'available' })} />)

      fireEvent.click(screen.getByRole('button', { name: /新しいバージョン v1\.1\.0 があります — 変更点を見る/ }))

      expect(openPending).toHaveBeenCalledOnce()
    })

    it('「更新」で install を呼ぶ', () => {
      const install = vi.fn()
      render(<UpdateBanner update={state({ phase: 'available', install })} />)

      fireEvent.click(screen.getByRole('button', { name: '更新' }))

      expect(install).toHaveBeenCalledOnce()
    })

    it('✕ で dismiss を呼ぶ', () => {
      const dismiss = vi.fn()
      render(<UpdateBanner update={state({ phase: 'available', dismiss })} />)

      fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

      expect(dismiss).toHaveBeenCalledOnce()
    })
  })

  describe('ダウンロード中（downloading）', () => {
    it('進み具合を % で出す', () => {
      render(<UpdateBanner update={state({ phase: 'downloading', percent: 42 })} />)

      expect(screen.getByText('ダウンロード中… 42%')).toBeInTheDocument()
    })

    it('「更新」は押せない', () => {
      render(<UpdateBanner update={state({ phase: 'downloading', percent: 42 })} />)

      expect(screen.getByRole('button', { name: '更新' })).toBeDisabled()
    })
  })

  describe('適用中（installing）', () => {
    it('適用中であることを出す', () => {
      render(<UpdateBanner update={state({ phase: 'installing' })} />)

      expect(screen.getByText('更新を適用しています…')).toBeInTheDocument()
    })

    it('「更新」は押せない', () => {
      render(<UpdateBanner update={state({ phase: 'installing' })} />)

      expect(screen.getByRole('button', { name: '更新' })).toBeDisabled()
    })
  })

  describe('計測中の更新の確認（confirmingInstall）', () => {
    it('アプリ内の確認ダイアログを出す', () => {
      render(<UpdateBanner update={state({ phase: 'available', confirmingInstall: true })} />)

      expect(screen.getByRole('alertdialog')).toHaveTextContent('作業を保存して更新します。アプリが再起動します。よろしいですか？')
    })

    it('確認中でなければダイアログを出さない', () => {
      render(<UpdateBanner update={state({ phase: 'available', confirmingInstall: false })} />)

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('「更新する」で confirmInstall を呼ぶ', () => {
      const confirmInstall = vi.fn()
      render(<UpdateBanner update={state({ phase: 'available', confirmingInstall: true, confirmInstall })} />)

      fireEvent.click(screen.getByRole('button', { name: '更新する' }))

      expect(confirmInstall).toHaveBeenCalledOnce()
    })

    it('「キャンセル」で cancelInstall を呼ぶ', () => {
      const cancelInstall = vi.fn()
      render(<UpdateBanner update={state({ phase: 'available', confirmingInstall: true, cancelInstall })} />)

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

      expect(cancelInstall).toHaveBeenCalledOnce()
    })
  })
})
