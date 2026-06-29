// src/main/update/updateService.ts
import { join } from 'path'
import { normalizeVersion, isNewerVersion } from '../../shared/version'
import { selectDmgAsset } from './selectAsset'
import type { UpdateInfo } from '../../shared/types'
import type { GithubRelease } from './githubRelease'
import type { IpcEventName, IpcEventPayload } from '../../shared/ipc'

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INSTALL_POLL_MS = 3000

export interface UpdateServiceDeps {
  currentVersion: string
  arch: string
  isPackaged: boolean
  execPath: string
  tmpDir: string
  getDismissedVersion: () => Promise<string>
  setDismissedVersion: (version: string) => Promise<void>
  fetchRelease: () => Promise<GithubRelease>
  readInstalledVersion: (execPath: string) => Promise<string | null>
  downloadFile: (url: string, dest: string, onProgress: (p: number) => void) => Promise<void>
  send: <E extends IpcEventName>(event: E, payload: IpcEventPayload<E>) => void
  openPath: (path: string) => Promise<string>
  openExternal: (url: string) => Promise<void>
  relaunch: () => void
  logError: (...args: unknown[]) => void
  appPath: string | null
  runInstaller: (opts: { dmgPath: string; appPath: string }) => void
  quit: () => void
  waitForRenderer: () => Promise<void>
}

export interface UpdateService {
  checkForUpdate(): Promise<UpdateInfo>
  checkAndNotify(): Promise<void>
  startPeriodicCheck(): void
  download(): Promise<void>
  install(): Promise<void>
  dismiss(version: string): Promise<void>
  restart(): void
  pollInstalledOnce(): Promise<boolean>
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  let installTimer: ReturnType<typeof setInterval> | null = null

  async function checkForUpdate(): Promise<UpdateInfo> {
    const release = await deps.fetchRelease()
    const latestVersion = normalizeVersion(release.tagName)
    const asset = selectDmgAsset(release.assets, deps.arch)
    return {
      currentVersion: deps.currentVersion,
      latestVersion,
      hasUpdate: isNewerVersion(latestVersion, deps.currentVersion),
      releaseUrl: release.htmlUrl,
      downloadUrl: asset?.url ?? null,
      assetName: asset?.name ?? null,
      notes: release.body,
    }
  }

  async function checkAndNotify(): Promise<void> {
    try {
      const info = await checkForUpdate()
      const dismissed = await deps.getDismissedVersion()
      if (info.hasUpdate && info.latestVersion !== dismissed) {
        deps.send('update-available', info)
      }
    } catch (e) {
      deps.logError('update check failed:', e)
    }
  }

  function startPeriodicCheck(): void {
    void checkAndNotify()
    setInterval(() => void checkAndNotify(), CHECK_INTERVAL_MS)
  }

  async function pollInstalledOnce(): Promise<boolean> {
    if (!deps.isPackaged) return false
    const installed = await deps.readInstalledVersion(deps.execPath)
    if (installed && installed !== deps.currentVersion) {
      deps.send('update-installed', { version: installed })
      return true
    }
    return false
  }

  function startInstallWatch(): void {
    if (!deps.isPackaged || installTimer) return
    installTimer = setInterval(() => {
      void pollInstalledOnce().then(done => {
        if (done && installTimer) {
          clearInterval(installTimer)
          installTimer = null
        }
      })
    }, INSTALL_POLL_MS)
  }

  async function download(): Promise<void> {
    let info: UpdateInfo
    try {
      info = await checkForUpdate()
    } catch (e) {
      deps.logError('update download: re-check failed:', e)
      deps.send('update-download-progress', { percent: 0, done: true, error: '更新情報の取得に失敗しました' })
      return
    }
    if (!info.downloadUrl || !info.assetName) {
      await deps.openExternal(info.releaseUrl)
      return
    }
    const dest = join(deps.tmpDir, info.assetName)
    try {
      await deps.downloadFile(info.downloadUrl, dest, p =>
        deps.send('update-download-progress', { percent: p, done: false }),
      )
      deps.send('update-download-progress', { percent: 100, done: true })
      await deps.openPath(dest)
      startInstallWatch()
    } catch (e) {
      deps.logError('update download failed:', e)
      deps.send('update-download-progress', { percent: 0, done: true, error: 'ダウンロードに失敗しました' })
    }
  }

  async function install(): Promise<void> {
    let info: UpdateInfo
    try {
      info = await checkForUpdate()
    } catch (e) {
      deps.logError('update install: re-check failed:', e)
      deps.send('update-download-progress', { percent: 0, done: true, error: '更新情報の取得に失敗しました' })
      return
    }
    if (!info.downloadUrl || !info.assetName) {
      await deps.openExternal(info.releaseUrl)
      return
    }
    const dest = join(deps.tmpDir, info.assetName)
    try {
      await deps.downloadFile(info.downloadUrl, dest, p =>
        deps.send('update-download-progress', { percent: p, done: false }),
      )
      deps.send('update-download-progress', { percent: 100, done: true })
    } catch (e) {
      deps.logError('update install: download failed:', e)
      deps.send('update-download-progress', { percent: 0, done: true, error: 'ダウンロードに失敗しました' })
      return
    }
    // 開発時 / .app パス不明 は自己差し替え不可 → DMG を開く従来挙動
    if (!deps.isPackaged || !deps.appPath) {
      await deps.openPath(dest)
      return
    }
    await deps.waitForRenderer()
    deps.runInstaller({ dmgPath: dest, appPath: deps.appPath })
    deps.quit()
  }

  async function dismiss(version: string): Promise<void> {
    await deps.setDismissedVersion(version)
  }

  function restart(): void {
    deps.relaunch()
  }

  return { checkForUpdate, checkAndNotify, startPeriodicCheck, download, install, dismiss, restart, pollInstalledOnce }
}
