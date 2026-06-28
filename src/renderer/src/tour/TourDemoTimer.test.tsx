import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TourDemoTimer } from './TourDemoTimer'

describe('TourDemoTimer', () => {
  it('ダミーセッションと注ぐ・勤務時間を表示する', () => {
    render(<TourDemoTimer />)
    expect(screen.getByText('資料作成')).toBeInTheDocument()
    expect(screen.getByText('ミーティング')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '注ぐ' })).toBeInTheDocument()
    expect(screen.getByText(/今日注いだ時間/)).toBeInTheDocument()
  })
})
