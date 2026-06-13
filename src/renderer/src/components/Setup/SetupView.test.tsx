import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupView } from './SetupView'

const api = {
  getTheme: vi.fn().mockResolvedValue('milk'),
  setTheme: vi.fn().mockResolvedValue(undefined),
  onThemeChanged: vi.fn(() => () => {}),
  completeSetup: vi.fn().mockResolvedValue(undefined),
  getAuthStatus: vi.fn(),
  signInWithSlack: vi.fn().mockResolvedValue(undefined),
  signOutSlack: vi.fn().mockResolvedValue(undefined),
  onAuthChanged: vi.fn(() => () => {}),
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getAuthStatus.mockResolvedValue({ signedIn: false })
  Object.assign(window, { electronAPI: api })
})

describe('SetupView step2（サインイン）', () => {
  async function goToStep2() {
    render(<SetupView />)
    await userEvent.click(await screen.findByRole('button', { name: 'はじめる' }))
  }

  it('未サインインならサインインボタンと「あとで設定する」が出る', async () => {
    await goToStep2()
    expect(await screen.findByRole('button', { name: 'Slack でサインイン' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'あとで設定する' })).toBeInTheDocument()
  })

  it('サインインボタンで signInWithSlack を呼ぶ', async () => {
    await goToStep2()
    await userEvent.click(await screen.findByRole('button', { name: 'Slack でサインイン' }))
    expect(api.signInWithSlack).toHaveBeenCalled()
  })

  it('「あとで設定する」で step3 に進める', async () => {
    await goToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'あとで設定する' }))
    expect(await screen.findByRole('button', { name: '完了' })).toBeInTheDocument()
  })

  it('サインイン済みなら名前と「次へ」が出る', async () => {
    api.getAuthStatus.mockResolvedValue({ signedIn: true, name: '金山' })
    await goToStep2()
    expect(await screen.findByText(/金山/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次へ' })).toBeInTheDocument()
  })
})
