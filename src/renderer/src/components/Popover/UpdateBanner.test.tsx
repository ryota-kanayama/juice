// src/renderer/src/components/Popover/UpdateBanner.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateBanner } from './UpdateBanner'
import type { UpdateState } from '../../hooks/useUpdate'

const info = {
  currentVersion: '1.0.0', latestVersion: '1.1.0', hasUpdate: true,
  releaseUrl: 'u', downloadUrl: 'd', assetName: 'a.dmg', notes: '',
}

function state(over: Partial<UpdateState>): UpdateState {
  return {
    phase: 'idle', info: null, percent: 0, error: null, currentVersion: '',
    check: vi.fn(), install: vi.fn(), restart: vi.fn(), dismiss: vi.fn(),
    ...over,
  }
}

beforeEach(() => vi.restoreAllMocks())

describe('UpdateBanner', () => {
  it('idle では何も描画しない', () => {
    const { container } = render(<UpdateBanner update={state({ phase: 'idle' })} />)
    expect(container.firstChild).toBeNull()
  })

  it('available でバージョンと更新ボタンを表示', () => {
    render(<UpdateBanner update={state({ phase: 'available', info })} />)
    expect(screen.getByText(/1\.1\.0/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument()
  })

  it('更新ボタンで install を呼ぶ', () => {
    const install = vi.fn()
    render(<UpdateBanner update={state({ phase: 'available', info, install })} />)
    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    expect(install).toHaveBeenCalled()
  })

  it('✕ で dismiss を呼ぶ', () => {
    const dismiss = vi.fn()
    render(<UpdateBanner update={state({ phase: 'available', info, dismiss })} />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(dismiss).toHaveBeenCalled()
  })

  it('downloading では進捗を表示し更新ボタンは無効', () => {
    render(<UpdateBanner update={state({ phase: 'downloading', info, percent: 42 })} />)
    expect(screen.getByText(/42%/)).toBeInTheDocument()
  })

  it('opened で再起動ボタンを押すと注入された restart が呼ばれる', () => {
    const restart = vi.fn()
    render(<UpdateBanner update={state({ phase: 'opened', info, restart })} />)
    fireEvent.click(screen.getByRole('button', { name: '再起動' }))
    expect(restart).toHaveBeenCalled()
  })

  it('installed で再起動ボタンを押すと注入された restart が呼ばれる', () => {
    const restart = vi.fn()
    render(<UpdateBanner update={state({ phase: 'installed', info, restart })} />)
    fireEvent.click(screen.getByRole('button', { name: '再起動' }))
    expect(restart).toHaveBeenCalled()
  })

  it('installing 中は適用中の文言を表示する', () => {
    render(<UpdateBanner update={state({ phase: 'installing', info })} />)
    expect(screen.getByText('更新を適用しています…')).toBeInTheDocument()
  })
})
