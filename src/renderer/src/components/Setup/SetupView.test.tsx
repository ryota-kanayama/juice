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
  getWhiteboardSettings: vi.fn().mockResolvedValue({ enabled: false }),
  setWhiteboardSettings: vi.fn().mockResolvedValue(undefined),
  getMainProjectCode: vi.fn().mockResolvedValue(''),
  setMainProjectCode: vi.fn().mockResolvedValue(undefined),
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getAuthStatus.mockResolvedValue({ signedIn: false })
  api.getWhiteboardSettings.mockResolvedValue({ enabled: false })
  api.getMainProjectCode.mockResolvedValue('')
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

  it('「あとで設定する」で連携設定ステップに進める', async () => {
    await goToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'あとで設定する' }))
    expect(await screen.findByLabelText('主プロジェクトコード')).toBeInTheDocument()
  })

  it('サインイン済みなら名前と「次へ」が出る', async () => {
    api.getAuthStatus.mockResolvedValue({ signedIn: true, name: '金山' })
    await goToStep2()
    expect(await screen.findByText(/金山/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次へ' })).toBeInTheDocument()
  })
})

describe('SetupView step3（連携設定）', () => {
  async function goToStep3() {
    render(<SetupView />)
    await userEvent.click(await screen.findByRole('button', { name: 'はじめる' }))
    await userEvent.click(await screen.findByRole('button', { name: 'あとで設定する' }))
    await screen.findByLabelText('主プロジェクトコード')
  }

  it('ホワイトボード連携トグルと主プロジェクトコード入力欄が出る', async () => {
    await goToStep3()
    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByLabelText('主プロジェクトコード')).toBeInTheDocument()
  })

  it('主プロジェクトコードを入力すると setMainProjectCode を呼ぶ', async () => {
    await goToStep3()
    await userEvent.type(screen.getByLabelText('主プロジェクトコード'), 'PROJ-001')
    expect(api.setMainProjectCode).toHaveBeenLastCalledWith('PROJ-001')
  })

  it('ホワイトボード連携トグルで setWhiteboardSettings を呼ぶ', async () => {
    await goToStep3()
    await userEvent.click(screen.getByRole('switch'))
    expect(api.setWhiteboardSettings).toHaveBeenCalledWith(true)
  })

  it('「次へ」でテーマステップに進める', async () => {
    await goToStep3()
    await userEvent.click(screen.getByRole('button', { name: '次へ' }))
    expect(await screen.findByText('お好みのテーマを選んでください')).toBeInTheDocument()
  })

  it('テーマの「次へ」で操作の基本（完了）ステップに進める', async () => {
    await goToStep3()
    await userEvent.click(screen.getByRole('button', { name: '次へ' }))
    await screen.findByText('お好みのテーマを選んでください')
    await userEvent.click(screen.getByRole('button', { name: '次へ' }))
    expect(await screen.findByText('操作の基本')).toBeInTheDocument()
    expect(screen.getByText('作業を始める')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '完了' })).toBeInTheDocument()
  })
})
