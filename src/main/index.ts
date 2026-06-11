import { app, nativeImage } from 'electron'
import { join } from 'path'
import os from 'os'
import { SessionStore } from './sessionStore'
import { SettingsStore } from './settingsStore'
import { createSetupWindow } from './windows/setup'
import { createTray } from './windows/tray'
import { startIdleCheck } from './notifications/idle'
import { registerIpcHandlers } from './ipc/registerHandlers'

// 複数インスタンスの起動を防ぐ（プロダクション向け）
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// electron-vite がファイル変更で再起動する際の SIGTERM、
// および Ctrl+C による SIGINT で確実に終了する
process.on('SIGTERM', () => app.quit())
process.on('SIGINT', () => app.quit())

const dataDir = join(os.homedir(), 'Library', 'Application Support', 'Juice')
const sessionStore = new SessionStore(dataDir)
const settingsStore = new SettingsStore(dataDir)

app.whenReady().then(async () => {
  // 開発時もDockにアプリアイコンを表示する（パッケージ版はバンドルの icns が使われる）
  const dockIcon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  if (!dockIcon.isEmpty()) {
    app.dock?.setIcon(dockIcon)
  }

  registerIpcHandlers(sessionStore, settingsStore)

  // 初回セットアップ判定
  const needsSetup = !(await settingsStore.isSetupCompleted()) && !(await settingsStore.getUserName())

  if (needsSetup) {
    // 初回起動: Dockを表示してセットアップウィンドウを開く
    app.dock?.show()
    createSetupWindow(settingsStore)
  } else {
    // 通常起動: メニューバーアプリとしてDockに表示しない
    app.dock?.hide()
    createTray(settingsStore)
    startIdleCheck(settingsStore)
  }
})

// メニューバーアプリなのでウィンドウが全部閉じてもアプリは終了しない
app.on('window-all-closed', () => {
  // do nothing
})
