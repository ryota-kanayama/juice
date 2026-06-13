import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountSection } from './AccountSection'

const api = {
  getAuthStatus: vi.fn(),
  signInWithSlack: vi.fn().mockResolvedValue(undefined),
  signOutSlack: vi.fn().mockResolvedValue(undefined),
  onAuthChanged: vi.fn((_cb: (status: { signedIn: boolean; name?: string }) => void) => () => {}),
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { electronAPI: api })
})

describe('AccountSection', () => {
  it('未サインイン時はサインインボタンを表示し、クリックで signInWithSlack を呼ぶ', async () => {
    api.getAuthStatus.mockResolvedValue({ signedIn: false })
    render(<AccountSection />)
    const button = await screen.findByRole('button', { name: 'Slack でサインイン' })
    await userEvent.click(button)
    expect(api.signInWithSlack).toHaveBeenCalled()
  })

  it('サインイン済みなら名前と有効期限を表示する', async () => {
    api.getAuthStatus.mockResolvedValue({
      signedIn: true, name: '金山', expiresAt: '2026-09-09T00:00:00.000Z',
    })
    render(<AccountSection />)
    expect(await screen.findByText(/金山/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'サインアウト' })).toBeInTheDocument()
  })

  it('サインアウトボタンで signOutSlack を呼ぶ', async () => {
    api.getAuthStatus.mockResolvedValue({ signedIn: true, name: '金山' })
    render(<AccountSection />)
    await userEvent.click(await screen.findByRole('button', { name: 'サインアウト' }))
    expect(api.signOutSlack).toHaveBeenCalled()
  })

  it('auth-changed イベントで表示が更新される', async () => {
    api.getAuthStatus.mockResolvedValue({ signedIn: false })
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Slack でサインイン' })
    const listener = api.onAuthChanged.mock.calls[0][0]
    act(() => {
      listener({ signedIn: true, name: '金山' })
    })
    await waitFor(() => expect(screen.getByText(/金山/)).toBeInTheDocument())
  })
})
