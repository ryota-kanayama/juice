import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UsageGuide } from './UsageGuide'

describe('UsageGuide', () => {
  it('主要な操作項目を表示する', () => {
    render(<UsageGuide />)
    expect(screen.getByText('記録を編集')).toBeInTheDocument()
    expect(screen.getByText('追加・削除')).toBeInTheDocument()
    expect(screen.getByText('並び替え')).toBeInTheDocument()
    expect(screen.getAllByText(/ダブルクリック/).length).toBeGreaterThan(0)
  })
})
