import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView } from './SettingsView'
import type { SettingsState } from '../../hooks/useSettings'
import type { UpdateState } from '../../hooks/useUpdate'

const settings = vi.hoisted(() => ({ current: null as unknown as SettingsState }))
const update = vi.hoisted(() => ({ current: null as unknown as UpdateState }))
vi.mock('../../hooks/useSettings', () => ({ useSettings: () => settings.current }))
vi.mock('../../hooks/useUpdate', () => ({ useUpdate: () => update.current }))
vi.mock('../../repositories/releaseNotesRepository', () => ({
  releaseNotesRepository: { openCurrent: vi.fn() },
}))

function renderUpdateSection(overrides: Partial<UpdateState>): void {
  settings.current = {
    activeThemeId: 'default', idleEnabled: false, idleMinutes: 60, elapsedEnabled: false,
    elapsedMinutes: 30, pomodoroEnabled: false, whiteboardEnabled: false, breakBehavior: 'stop',
    mainProjectCode: '', launchAtLogin: false,
    setTheme: vi.fn(), setIdle: vi.fn(), setElapsed: vi.fn(), setPomodoro: vi.fn(),
    setWhiteboard: vi.fn(), setBreakBehavior: vi.fn(), setMainProjectCode: vi.fn(),
    setLaunchAtLogin: vi.fn(),
  }
  update.current = {
    phase: 'available',
    info: {
      currentVersion: '1.0.0', latestVersion: '1.1.0', hasUpdate: true,
      releaseUrl: 'u', downloadUrl: 'd', assetName: 'a.dmg', notes: '',
    },
    percent: 0, error: null, currentVersion: '1.0.0', checking: false, checkedUpToDate: false,
    check: vi.fn(), install: vi.fn(), confirmingInstall: false, confirmInstall: vi.fn(),
    cancelInstall: vi.fn(), dismiss: vi.fn(),
    ...overrides,
  }
  render(<SettingsView />)
}

describe('SettingsView', () => {
  it('計測中の更新の確認中は、アップデート欄にアプリ内の確認ダイアログを出す', async () => {
    renderUpdateSection({ confirmingInstall: true })

    await userEvent.click(screen.getByRole('tab', { name: 'アップデート' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('作業を保存して更新します。アプリが再起動します。よろしいですか？')
  })
})
