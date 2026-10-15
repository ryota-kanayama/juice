import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupView } from './SetupView'

const api = {
  getTheme: vi.fn(),
  setTheme: vi.fn(),
  onThemeChanged: vi.fn(() => () => {}),
  completeSetup: vi.fn(),
  getAuthStatus: vi.fn(),
  signInWithSlack: vi.fn(),
  signOutSlack: vi.fn(),
  onAuthChanged: vi.fn(() => () => {}),
  getWhiteboardSettings: vi.fn(),
  setWhiteboardSettings: vi.fn(),
  getMainProjectCode: vi.fn(),
  setMainProjectCode: vi.fn(),
}

const button = (name: string) => screen.findByRole('button', { name })

/** 「はじめる」で step2（サインイン）へ進める */
async function goToSignIn(): Promise<void> {
  render(<SetupView />)
  await userEvent.click(await button('はじめる'))
}

/** step3（連携設定）まで進める */
async function goToIntegrations(): Promise<void> {
  await goToSignIn()
  await userEvent.click(await button('あとで設定する'))
  await screen.findByLabelText('主プロジェクトコード')
}

/** step4（テーマ）まで進める */
async function goToTheme(): Promise<void> {
  await goToIntegrations()
  await userEvent.click(await button('次へ'))
  await button('完了')
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.getTheme.mockResolvedValue('milk')
  api.onThemeChanged.mockReturnValue(() => {})
  api.onAuthChanged.mockReturnValue(() => {})
  api.getAuthStatus.mockResolvedValue({ signedIn: false })
  api.getWhiteboardSettings.mockResolvedValue({ enabled: false })
  api.getMainProjectCode.mockResolvedValue('')
  for (const fn of [api.setTheme, api.completeSetup, api.signInWithSlack, api.setWhiteboardSettings, api.setMainProjectCode]) {
    fn.mockResolvedValue(undefined)
  }
  Object.assign(window, { bridge: api })
})

describe('SetupView', () => {
  describe('step2（サインイン）', () => {
    it('未サインインならサインインを勧める', async () => {
      await goToSignIn()

      expect(await button('Slack でサインイン')).toBeInTheDocument()
    })

    it('未サインインなら「あとで設定する」で飛ばせる', async () => {
      await goToSignIn()

      expect(await button('あとで設定する')).toBeInTheDocument()
    })

    it('「Slack でサインイン」でサインインを始める', async () => {
      await goToSignIn()

      await userEvent.click(await button('Slack でサインイン'))

      expect(api.signInWithSlack).toHaveBeenCalledOnce()
    })

    it('サインイン済みなら名前と「次へ」を出す', async () => {
      api.getAuthStatus.mockResolvedValue({ signedIn: true, name: '金山' })

      await goToSignIn()

      expect(await screen.findByText(/金山/)).toBeInTheDocument()
      expect(await button('次へ')).toBeInTheDocument()
    })

    it('「← 戻る」で最初のステップへ戻る', async () => {
      await goToSignIn()

      await userEvent.click(await button('← 戻る'))

      expect(await button('はじめる')).toBeInTheDocument()
    })
  })

  describe('step3（連携設定）', () => {
    it('主プロジェクトコードを入力すると保存する', async () => {
      await goToIntegrations()

      await userEvent.type(screen.getByLabelText('主プロジェクトコード'), 'PROJ-001')

      expect(api.setMainProjectCode).toHaveBeenLastCalledWith('PROJ-001')
    })

    it('ホワイトボード連携をオンにすると保存する', async () => {
      await goToIntegrations()

      await userEvent.click(screen.getByRole('switch'))

      expect(api.setWhiteboardSettings).toHaveBeenCalledWith(true)
    })
  })

  describe('step4（テーマ）', () => {
    it('テーマを選ぶと保存する', async () => {
      await goToTheme()

      await userEvent.click(screen.getByRole('button', { name: /Soda/ }))

      expect(api.setTheme).toHaveBeenCalledWith('soda')
    })

    it('「完了」でセットアップの完了を保存する', async () => {
      await goToTheme()

      await userEvent.click(await button('完了'))

      expect(api.completeSetup).toHaveBeenCalledOnce()
    })
  })
})
