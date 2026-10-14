import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TourDemoTimer } from './TourDemoTimer'

describe('TourDemoTimer', () => {
  it('ダミーのセッションを表示する', () => {
    render(<TourDemoTimer />)

    expect(screen.getByText('資料作成')).toBeInTheDocument()
    expect(screen.getByText('ミーティング')).toBeInTheDocument()
  })

  it('ツアーが指し示す「注ぐ」ボタンを表示する', () => {
    render(<TourDemoTimer />)

    expect(screen.getByRole('button', { name: '注ぐ' })).toBeInTheDocument()
  })

  it('ツアーが指し示す勤務時間の欄を表示する', () => {
    render(<TourDemoTimer />)

    expect(screen.getByText(/今日注いだ時間/)).toBeInTheDocument()
  })
})
