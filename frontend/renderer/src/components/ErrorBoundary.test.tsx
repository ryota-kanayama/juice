import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function BrokenComponent(): never {
  throw new Error('テストエラー')
}

function renderBroken() {
  return render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>)
}

beforeEach(() => {
  // React と ErrorBoundary 自身が出すエラーログを抑える
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('エラーが無ければ子をそのまま描く', () => {
    render(<ErrorBoundary><p>正常コンテンツ</p></ErrorBoundary>)

    expect(screen.getByText('正常コンテンツ')).toBeInTheDocument()
  })

  it('子がエラーを投げたら、エラーの案内に切り替える', () => {
    renderBroken()

    expect(screen.getByText('予期しないエラーが発生しました')).toBeInTheDocument()
  })

  it('エラーの内容を出す', () => {
    renderBroken()

    expect(screen.getByText('テストエラー')).toBeInTheDocument()
  })

  it('捕まえたエラーをログに残す', () => {
    renderBroken()

    expect(console.error).toHaveBeenCalledWith('ErrorBoundary caught:', expect.any(Error), expect.any(String))
  })

  it('「再読み込み」で画面を読み込み直す', () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })
    renderBroken()

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))

    expect(reload).toHaveBeenCalledOnce()
  })
})
