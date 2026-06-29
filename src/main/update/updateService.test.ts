// src/main/update/updateService.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createUpdateService, type UpdateServiceDeps } from './updateService'
import type { GithubRelease } from './githubRelease'

function baseDeps(over: Partial<UpdateServiceDeps> = {}): UpdateServiceDeps {
  const release: GithubRelease = {
    tagName: 'v1.1.0',
    htmlUrl: 'https://github.com/ryota-kanayama/juice/releases/tag/v1.1.0',
    body: 'notes',
    assets: [
      { name: 'Juice-1.1.0-arm64.dmg', url: 'https://x/arm64.dmg' },
      { name: 'Juice-1.1.0.dmg', url: 'https://x/x64.dmg' },
    ],
  }
  return {
    currentVersion: '1.0.0',
    arch: 'arm64',
    isPackaged: true,
    tmpDir: '/tmp',
    getDismissedVersion: vi.fn(async () => ''),
    setDismissedVersion: vi.fn(async () => {}),
    fetchRelease: vi.fn(async () => release),
    downloadFile: vi.fn(async () => {}),
    send: vi.fn(),
    openPath: vi.fn(async () => ''),
    openExternal: vi.fn(async () => {}),
    logError: vi.fn(),
    appPath: '/Applications/Juice.app',
    runInstaller: vi.fn(),
    quit: vi.fn(),
    waitForRenderer: vi.fn(async () => {}),
    ...over,
  }
}

describe('checkForUpdate', () => {
  it('arch 一致 DMG を選び hasUpdate を判定する', async () => {
    const svc = createUpdateService(baseDeps())
    const info = await svc.checkForUpdate()
    expect(info).toMatchObject({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      hasUpdate: true,
      downloadUrl: 'https://x/arm64.dmg',
      assetName: 'Juice-1.1.0-arm64.dmg',
    })
  })
})

describe('checkAndNotify', () => {
  it('更新あり・未 dismiss なら update-available を送る', async () => {
    const deps = baseDeps()
    await createUpdateService(deps).checkAndNotify()
    expect(deps.send).toHaveBeenCalledWith('update-available', expect.objectContaining({ hasUpdate: true }))
  })
  it('dismiss 済みバージョンなら送らない', async () => {
    const deps = baseDeps({ getDismissedVersion: vi.fn(async () => '1.1.0') })
    await createUpdateService(deps).checkAndNotify()
    expect(deps.send).not.toHaveBeenCalled()
  })
  it('取得失敗は無音（送らず logError）', async () => {
    const deps = baseDeps({ fetchRelease: vi.fn(async () => { throw new Error('net') }) })
    await createUpdateService(deps).checkAndNotify()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.logError).toHaveBeenCalled()
  })
})

describe('dismiss', () => {
  it('dismiss は setDismissedVersion を呼ぶ', async () => {
    const deps = baseDeps()
    await createUpdateService(deps).dismiss('1.1.0')
    expect(deps.setDismissedVersion).toHaveBeenCalledWith('1.1.0')
  })
})

describe('install', () => {
  it('DL→保存待ち→runInstaller→quit の順に進む（パッケージ版）', async () => {
    const deps = baseDeps()
    await createUpdateService(deps).install()
    expect(deps.downloadFile).toHaveBeenCalledWith(
      'https://x/arm64.dmg', '/tmp/Juice-1.1.0-arm64.dmg', expect.any(Function),
    )
    expect(deps.send).toHaveBeenCalledWith('update-download-progress', { percent: 100, done: true })
    expect(deps.waitForRenderer).toHaveBeenCalled()
    expect(deps.runInstaller).toHaveBeenCalledWith({
      dmgPath: '/tmp/Juice-1.1.0-arm64.dmg', appPath: '/Applications/Juice.app',
    })
    expect(deps.quit).toHaveBeenCalled()
  })

  it('未パッケージなら自己差し替えせず openPath にフォールバック', async () => {
    const deps = baseDeps({ isPackaged: false })
    await createUpdateService(deps).install()
    expect(deps.openPath).toHaveBeenCalledWith('/tmp/Juice-1.1.0-arm64.dmg')
    expect(deps.runInstaller).not.toHaveBeenCalled()
    expect(deps.quit).not.toHaveBeenCalled()
  })

  it('arch 一致 DMG が無ければ releaseUrl を外部で開き、差し替えしない', async () => {
    const deps = baseDeps({
      fetchRelease: vi.fn(async () => ({ tagName: 'v1.1.0', htmlUrl: 'https://rel', body: '', assets: [] })),
    })
    await createUpdateService(deps).install()
    expect(deps.openExternal).toHaveBeenCalledWith('https://rel')
    expect(deps.runInstaller).not.toHaveBeenCalled()
    expect(deps.quit).not.toHaveBeenCalled()
  })

  it('DL 失敗時はエラー進捗を送り quit しない', async () => {
    const deps = baseDeps({ downloadFile: vi.fn(async () => { throw new Error('net') }) })
    await createUpdateService(deps).install()
    expect(deps.send).toHaveBeenCalledWith('update-download-progress', { percent: 0, done: true, error: 'ダウンロードに失敗しました' })
    expect(deps.quit).not.toHaveBeenCalled()
  })
})
