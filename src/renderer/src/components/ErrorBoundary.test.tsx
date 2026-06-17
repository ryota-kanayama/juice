import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function BrokenComponent(): never {
  throw new Error('テストエラー')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('通常時は children をそのまま描画する', () => {
    render(<ErrorBoundary><p>正常コンテンツ</p></ErrorBoundary>)
    expect(screen.getByText('正常コンテンツ')).toBeInTheDocument()
  })

  it('children がエラーを投げると fallback UI を表示する', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>)
    expect(screen.getByText(/予期しないエラー/)).toBeInTheDocument()
  })

  it('fallback UI に再読み込みボタンがある', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>)
    expect(screen.getByRole('button', { name: /再読み込み/ })).toBeInTheDocument()
  })
})
