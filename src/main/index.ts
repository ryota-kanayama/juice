import { app, nativeImage, shell } from 'electron'
import { join } from 'path'
import os from 'os'
import { SessionStore } from './sessionStore'
import { DailyStore } from './dailyStore'
import { SettingsStore } from './settingsStore'
import { AuthStore } from './auth/authStore'
import { handleAuthCallback } from './auth/signIn'
import { createSetupWindow } from './windows/setup'
import { createTray } from './windows/tray'
import { startIdleCheck } from './notifications/idle'
import { registerIpcHandlers } from './ipc/registerHandlers'
import { startSessionRefresh } from './auth/refreshSession'
import { logger } from './logger'
import { createUpdateService } from './update/updateService'
import { fetchLatestRelease } from './update/githubRelease'
import { downloadFile } from './update/downloadFile'
import { broadcastToAll } from './windows/updateBroadcast'
import { runInstaller } from './update/runInstaller'
import { prepareQuitForUpdate } from './update/prepareQuit'

// dev とパッケージ版でプロファイルを分離する（起動ロック衝突・localStorage 混入の防止）。
// requestSingleInstanceLock より前に設定する必要がある。
app.setPath(
  'userData',
  app.isPackaged
    ? join(os.homedir(), 'Library', 'Application Support', 'Juice')
    : join(os.homedir(), 'Library', 'Application Support', 'juice-dev')
)

// 複数インスタンスの起動を防ぐ（プロダクション向け）
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// electron-vite がファイル変更で再起動する際の SIGTERM、
// および Ctrl+C による SIGINT で確実に終了する
process.on('SIGTERM', () => app.quit())
process.on('SIGINT', () => app.quit())

// 上で setPath('userData', ...) によって dev は juice-dev、パッケージ版は Juice に分離済み。
// 全ストアで userData を使い、dev とパッケージ版のセッション・設定・認証データを一貫して分離する。
const dataDir = app.getPath('userData')
const sessionStore = new SessionStore(dataDir)
const dailyStore = new DailyStore(dataDir)
const settingsStore = new SettingsStore(dataDir)
const authStore = new AuthStore(dataDir)

/** execPath から実際の .app パスを導出する（例 /Applications/Juice.app）。dev 等で不明なら null */
function deriveAppPath(execPath: string): string | null {
  const i = execPath.indexOf('.app/')
  return i === -1 ? null : execPath.slice(0, i + 4)
}

const updateService = createUpdateService({
  currentVersion: app.getVersion(),
  arch: process.arch,
  isPackaged: app.isPackaged,
  tmpDir: app.getPath('temp'),
  getDismissedVersion: () => settingsStore.getDismissedUpdateVersion(),
  setDismissedVersion: (v) => settingsStore.setDismissedUpdateVersion(v),
  fetchRelease: () => fetchLatestRelease(),
  downloadFile,
  send: broadcastToAll,
  openPath: (p) => shell.openPath(p),
  openExternal: (u) => shell.openExternal(u),
  logError: (...args) => logger.error(...args),
  appPath: deriveAppPath(process.execPath),
  runInstaller: ({ dmgPath, appPath }) =>
    runInstaller({ dmgPath, appPath, tmpDir: app.getPath('temp'), pid: process.pid }),
  quit: () => app.quit(),
  waitForRenderer: () => prepareQuitForUpdate(),
})

// 開発時は汎用 Electron.app に紐づくため juice:// の E2E はパッケージ版で確認する
// juice:// カスタムスキーム（Slack サインインのコールバック受信）
app.setAsDefaultProtocolClient('juice')
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleAuthCallback(url, authStore).catch(err => logger.error('auth callback failed:', err))
})

// レンダラー発のナビゲーション・新規ウィンドウ生成を制限する多層防御。
// 自バンドル(file://)と dev サーバ(localhost:5174)以外への遷移を弾き、
// 外部 origin によるウィンドウ乗っ取りを防ぐ。外部リンクは shell:openUrl
// （http/https 限定の openExternal）経由のみ許可する。
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('http://localhost:5174') || url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      logger.warn('blocked navigation to:', url)
    }
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})

app.whenReady().then(async () => {
  // 開発時もDockにアプリアイコンを表示する（パッケージ版はバンドルの icns が使われる）
  const dockIcon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  if (!dockIcon.isEmpty()) {
    app.dock?.setIcon(dockIcon)
  }

  registerIpcHandlers(sessionStore, settingsStore, authStore, dailyStore, updateService)
  startSessionRefresh(authStore)

  // 初回セットアップ判定
  const needsSetup = !(await settingsStore.isSetupCompleted())

  if (needsSetup) {
    // 初回起動: Dockを表示してセットアップウィンドウを開く
    app.dock?.show()
    createSetupWindow(settingsStore)
  } else {
    // 通常起動: メニューバーアプリとしてDockに表示しない
    app.dock?.hide()
    createTray(settingsStore)
    startIdleCheck(settingsStore)
    updateService.startPeriodicCheck()
  }
})

// メニューバーアプリなのでウィンドウが全部閉じてもアプリは終了しない
app.on('window-all-closed', () => {
  // do nothing
})
