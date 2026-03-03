import { app, BrowserWindow, Tray, ipcMain, nativeImage, Menu, shell, Notification, screen } from 'electron'
import { join } from 'path'
import os from 'os'
import { SessionStore } from './sessionStore'
import { SettingsStore } from './settingsStore'

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
const store = new SessionStore(dataDir)
const settingsStore = new SettingsStore(dataDir)

let tray: Tray | null = null
let popoverWindow: BrowserWindow | null = null
let calendarWindow: BrowserWindow | null = null
let lastTrayBounds: { x: number; y: number; width: number; height: number } | null = null

// ウィンドウを表示した時に設定した位置（未移動の基準点）
// null の場合は位置不明なので閉じない
let anchorPosition: { x: number; y: number } | null = null

// アイドル検知用
let lastActivityTime: Date = new Date()
let idleNotificationSent: boolean = false
let idleCheckInterval: ReturnType<typeof setInterval> | null = null

// 経過時間通知用
let timerStartTime: Date | null = null
let elapsedCheckInterval: ReturnType<typeof setInterval> | null = null
let elapsedNotifyCount: number = 0

function createPopoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    vibrancy: 'hud',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // show イベント時点では macOS の位置制約が適用済みのため、ここで anchor を確定する
  win.on('show', () => {
    const [wx, wy] = win.getPosition()
    anchorPosition = { x: wx, y: wy }
  })

  // メインプロセスで blur を監視: 基準位置から動いていなければ閉じる
  win.on('blur', () => {
    if (!anchorPosition) return
    const [cx, cy] = win.getPosition()
    const moved = Math.abs(cx - anchorPosition.x) > 20 || Math.abs(cy - anchorPosition.y) > 20
    if (!moved) win.hide()
  })

  if (process.env['NODE_ENV'] === 'development') {
    win.loadURL('http://localhost:5173/')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', async () => {
    const themeId = await settingsStore.getTheme()
    win.webContents.send('theme-changed', themeId)
  })

  return win
}

let setupWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 500,
    resizable: false,
    title: 'Juice 設定',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  settingsWindow.webContents.on('did-finish-load', async () => {
    const themeId = await settingsStore.getTheme()
    settingsWindow!.webContents.send('theme-changed', themeId)
  })

  if (process.env['NODE_ENV'] === 'development') {
    settingsWindow.loadURL('http://localhost:5173/#settings')
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'settings' })
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function showPopoverFromNotification(): void {
  if (!popoverWindow || popoverWindow.isDestroyed()) {
    popoverWindow = createPopoverWindow()
  }
  if (popoverWindow.isVisible()) {
    popoverWindow.focus()
    return
  }
  if (lastTrayBounds) {
    const { x, y } = lastTrayBounds
    const winBounds = popoverWindow.getBounds()
    const xPos = Math.round(x - winBounds.width / 2)
    const yPos = Math.round(y)
    popoverWindow.setPosition(xPos, yPos)
  }
  popoverWindow.show()
  popoverWindow.focus()
}

async function startIdleCheck(): Promise<void> {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval)
    idleCheckInterval = null
  }

  const { enabled } = await settingsStore.getIdleSettings()
  if (!enabled) return

  idleCheckInterval = setInterval(async () => {
    const settings = await settingsStore.getIdleSettings()
    if (!settings.enabled) return

    const idleMs = Date.now() - lastActivityTime.getTime()
    const thresholdMs = settings.minutes * 60 * 1000

    if (idleMs >= thresholdMs && !idleNotificationSent && !timerStartTime) {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'Juice',
          body: 'ジュースを飲みたくありませんか？',
        })
        notif.on('click', () => {
          showPopoverFromNotification()
        })
        notif.show()
        idleNotificationSent = true
      }
    }
  }, 60 * 1000)
}

function startElapsedCheck(): void {
  if (elapsedCheckInterval) {
    clearInterval(elapsedCheckInterval)
    elapsedCheckInterval = null
  }
  if (!timerStartTime) return

  elapsedCheckInterval = setInterval(async () => {
    const settings = await settingsStore.getElapsedSettings()
    if (!settings.enabled || !timerStartTime) return

    const intervalMs = settings.minutes * 60 * 1000
    const nextNotifyAt = timerStartTime.getTime() + intervalMs * (elapsedNotifyCount + 1)

    if (Date.now() >= nextNotifyAt) {
      const totalMinutes = settings.minutes * (elapsedNotifyCount + 1)
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: 'Juice',
          body: `作業中 — ${totalMinutes}分経過しました`,
        })
        notif.on('click', () => {
          showPopoverFromNotification()
        })
        notif.show()
      }
      elapsedNotifyCount++
    }
  }, 60 * 1000)
}

function createSetupWindow(): void {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const winW = 440
  const winH = 400

  setupWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenW - winW) / 2),
    y: Math.round((screenH - winH) / 2),
    resizable: false,
    title: 'Juice — セットアップ',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setupWindow.webContents.on('did-finish-load', async () => {
    const themeId = await settingsStore.getTheme()
    setupWindow!.webContents.send('theme-changed', themeId)
  })

  if (process.env['NODE_ENV'] === 'development') {
    setupWindow.loadURL('http://localhost:5173/#setup')
  } else {
    setupWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'setup' })
  }

  setupWindow.on('closed', () => {
    setupWindow = null
    // セットアップ未完了でウィンドウを閉じた場合はアプリ終了
    if (!settingsStore.isSetupCompleted()) {
      app.quit()
    }
  })
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle('🧃')
  tray.setToolTip('Juice')

  const contextMenu = Menu.buildFromTemplate([
    { label: '設定', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Juice を終了', click: () => app.quit() },
  ])

  tray.on('right-click', () => {
    tray!.popUpContextMenu(contextMenu)
  })

  tray.on('click', (_, bounds) => {
    lastTrayBounds = bounds
    if (!popoverWindow || popoverWindow.isDestroyed()) {
      popoverWindow = createPopoverWindow()
    }

    if (popoverWindow.isVisible()) {
      popoverWindow.hide()
    } else {
      const { x, y } = bounds
      const winBounds = popoverWindow.getBounds()
      const xPos = Math.round(x - winBounds.width / 2)
      const yPos = Math.round(y)
      popoverWindow.setPosition(xPos, yPos)
      popoverWindow.show()  // show イベントで anchorPosition を確定する
      popoverWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  // 初回セットアップ判定
  const needsSetup = !(await settingsStore.isSetupCompleted()) && !(await settingsStore.getUserName())

  // IPCハンドラー（whenReady後に登録）
  ipcMain.handle('sessions:get', async (_, yearMonth: string) => {
    return store.getSessions(yearMonth)
  })

  ipcMain.handle('sessions:save', async (_, session) => {
    await store.saveSession(session)
    lastActivityTime = new Date()
    idleNotificationSent = false
  })

  ipcMain.handle('sessions:update', async (_, session) => {
    await store.updateSession(session)
    lastActivityTime = new Date()
    idleNotificationSent = false
  })

  ipcMain.handle('sessions:delete', async (_, { id, yearMonth }: { id: string; yearMonth: string }) => {
    await store.deleteSession(id, yearMonth)
  })

  ipcMain.handle('settings:getTheme', async () => {
    return settingsStore.getTheme()
  })

  ipcMain.handle('settings:setTheme', async (_, themeId: string) => {
    await settingsStore.setTheme(themeId)
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('theme-changed', themeId)
    })
  })

  ipcMain.handle('settings:getIdleSettings', async () => {
    return settingsStore.getIdleSettings()
  })

  ipcMain.handle('settings:setIdleSettings', async (_, { enabled, minutes }: { enabled: boolean; minutes: number }) => {
    await settingsStore.setIdleSettings(enabled, minutes)
    // 設定変更時はアイドルクロックをリセットして即時通知を防ぐ
    lastActivityTime = new Date()
    idleNotificationSent = false
    await startIdleCheck()
  })

  ipcMain.handle('settings:getUserName', async () => {
    return settingsStore.getUserName()
  })

  ipcMain.handle('settings:setUserName', async (_, userName: string) => {
    await settingsStore.setUserName(userName)
  })

  ipcMain.handle('attendance:send', async (_, text: string) => {
    const userName = await settingsStore.getUserName()
    if (!userName) {
      return { ok: false, status: 0, body: 'user_name が設定されていません' }
    }
    const { net } = await import('electron')
    const formBody = `user_name=${encodeURIComponent(userName)}&text=${encodeURIComponent(text)}`
    return new Promise<{ ok: boolean; status: number; body: string }>((resolve) => {
      const request = net.request({
        method: 'POST',
        url: `${import.meta.env.MAIN_VITE_ATTENDANCE_API_URL}?key=${import.meta.env.MAIN_VITE_ATTENDANCE_API_KEY}`,
      })
      request.setHeader('Content-Type', 'application/x-www-form-urlencoded')
      request.on('response', (response) => {
        let body = ''
        response.on('data', (chunk) => { body += chunk.toString() })
        response.on('end', () => {
          const ok = response.statusCode >= 200 && response.statusCode < 300
          resolve({ ok, status: response.statusCode, body })
        })
      })
      request.on('error', (err) => {
        resolve({ ok: false, status: 0, body: err.message })
      })
      request.write(formBody)
      request.end()
    })
  })

  ipcMain.handle('timer:started', () => {
    timerStartTime = new Date()
    elapsedNotifyCount = 0
    lastActivityTime = new Date()
    idleNotificationSent = false
    startElapsedCheck()
  })

  ipcMain.handle('timer:stopped', () => {
    timerStartTime = null
    elapsedNotifyCount = 0
    if (elapsedCheckInterval) {
      clearInterval(elapsedCheckInterval)
      elapsedCheckInterval = null
    }
  })

  ipcMain.handle('timer:adjustStartTime', (_, newStartMs: number) => {
    if (!timerStartTime) return
    timerStartTime = new Date(newStartMs)
    // 新しい開始時刻に合わせて通知済みカウントをリセットして再スケジュール
    elapsedNotifyCount = 0
    startElapsedCheck()
  })

  ipcMain.handle('settings:getElapsedSettings', async () => {
    return settingsStore.getElapsedSettings()
  })

  ipcMain.handle('settings:setElapsedSettings', async (_, { enabled, minutes }: { enabled: boolean; minutes: number }) => {
    await settingsStore.setElapsedSettings(enabled, minutes)
    if (timerStartTime) {
      startElapsedCheck()
    }
  })

  ipcMain.handle('setup:complete', async () => {
    await settingsStore.completeSetup()
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.close()
    }
    app.dock?.hide()
    createTray()
    startIdleCheck()
  })

  ipcMain.handle('calendar:open', () => {
    if (calendarWindow && !calendarWindow.isDestroyed()) {
      calendarWindow.focus()
      return
    }

    // ポップオーバーと同じ位置に表示する
    const [px, py] = popoverWindow?.getPosition() ?? [0, 0]

    calendarWindow = new BrowserWindow({
      width: 720,
      height: 520,
      x: px,
      y: py,
      title: 'Juice — カレンダー',
      transparent: true,
      vibrancy: 'hud',
      visualEffectState: 'active',
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    if (process.env['NODE_ENV'] === 'development') {
      calendarWindow.loadURL('http://localhost:5173/#calendar')
    } else {
      calendarWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: 'calendar',
      })
    }

    calendarWindow.webContents.on('did-finish-load', async () => {
      const themeId = await settingsStore.getTheme()
      calendarWindow!.webContents.send('theme-changed', themeId)
    })

    calendarWindow.on('closed', () => {
      calendarWindow = null
    })
  })

  ipcMain.handle('shell:openUrl', (_, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('window:hide', () => {
    popoverWindow?.hide()
  })

  ipcMain.handle('window:resize', (_, { width, height }: { width: number; height: number }) => {
    if (!popoverWindow || popoverWindow.isDestroyed()) return
    popoverWindow.setSize(width, height)
    if (lastTrayBounds) {
      const { x, y } = lastTrayBounds
      const [w] = popoverWindow.getSize()
      const newX = Math.round(x - w / 2)
      const newY = Math.round(y)
      popoverWindow.setPosition(newX, newY)
      // macOS の位置制約を考慮し実際の位置を読み戻す
      const [rax, ray] = popoverWindow.getPosition()
      anchorPosition = { x: rax, y: ray }
    }
  })

  if (needsSetup) {
    // 初回起動: Dockを表示してセットアップウィンドウを開く
    app.dock?.show()
    createSetupWindow()
  } else {
    // 通常起動: メニューバーアプリとしてDockに表示しない
    app.dock?.hide()
    createTray()
    startIdleCheck()
  }
})

// メニューバーアプリなのでウィンドウが全部閉じてもアプリは終了しない
app.on('window-all-closed', () => {
  // do nothing
})
