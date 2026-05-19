import { BrowserWindow } from 'electron'
import { join } from 'path'
import { broadcastThemeOnLoad } from './themeBroadcast'
import type { SettingsStore } from '../settingsStore'

// ポップオーバー画面の state はこのモジュールに閉じ込める。
let popoverWindow: BrowserWindow | null = null
// ウィンドウを表示した時に設定した位置（未移動の基準点）。null なら位置不明で閉じない。
let anchorPosition: { x: number; y: number } | null = null
let lastTrayBounds: { x: number; y: number; width: number; height: number } | null = null

export function getPopoverWindow(): BrowserWindow | null {
  return popoverWindow
}

export function setLastTrayBounds(bounds: { x: number; y: number; width: number; height: number }): void {
  lastTrayBounds = bounds
}

function createPopoverWindow(settingsStore: SettingsStore): BrowserWindow {
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
    win.loadURL('http://localhost:5174/')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  broadcastThemeOnLoad(win, settingsStore)
  return win
}

function ensurePopover(settingsStore: SettingsStore): BrowserWindow {
  if (!popoverWindow || popoverWindow.isDestroyed()) {
    popoverWindow = createPopoverWindow(settingsStore)
  }
  return popoverWindow
}

function showAt(win: BrowserWindow, bounds: { x: number; y: number }): void {
  const winBounds = win.getBounds()
  win.setPosition(Math.round(bounds.x - winBounds.width / 2), Math.round(bounds.y))
  win.show()
  win.focus()
}

/** トレイクリック: 表示中なら隠す、非表示ならトレイ位置で開く */
export function togglePopoverAt(
  settingsStore: SettingsStore,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  lastTrayBounds = bounds
  const win = ensurePopover(settingsStore)
  if (win.isVisible()) {
    win.hide()
  } else {
    showAt(win, bounds)
  }
}

/** 通知クリックなどから表示する。トレイ位置を覚えていればそこに、なければ既存位置のまま */
export function showPopoverFromNotification(settingsStore: SettingsStore): void {
  const win = ensurePopover(settingsStore)
  if (win.isVisible()) {
    win.focus()
    return
  }
  if (lastTrayBounds) showAt(win, lastTrayBounds)
  else { win.show(); win.focus() }
}

export function hidePopover(): void {
  popoverWindow?.hide()
}

/** タイマー状態に応じてサイズを変える。anchorPosition も実際の位置を読み戻して更新。 */
export function resizePopover(width: number, height: number): void {
  if (!popoverWindow || popoverWindow.isDestroyed()) return
  popoverWindow.setSize(width, height)
  if (lastTrayBounds) {
    const [w] = popoverWindow.getSize()
    popoverWindow.setPosition(Math.round(lastTrayBounds.x - w / 2), Math.round(lastTrayBounds.y))
    const [rax, ray] = popoverWindow.getPosition()
    anchorPosition = { x: rax, y: ray }
  }
}
