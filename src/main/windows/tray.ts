import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { setLastTrayBounds, togglePopoverAt } from './popover'
import { createSettingsWindow } from './settings'
import type { SettingsStore } from '../settingsStore'

let tray: Tray | null = null

export function createTray(settingsStore: SettingsStore): void {
  // 二重生成防止: 既存の Tray があれば破棄してから作り直す（アイコンの重複を防ぐ）
  tray?.destroy()
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 })
  tray = new Tray(icon)
  tray.setToolTip('Juice')

  const contextMenu = Menu.buildFromTemplate([
    { label: '設定', click: () => createSettingsWindow(settingsStore) },
    { type: 'separator' },
    { label: 'Juice を終了', click: () => app.quit() },
  ])

  tray.on('right-click', () => {
    tray!.popUpContextMenu(contextMenu)
  })

  // macOS ではデフォルトでダブルクリック検知が有効で、
  // 連続クリックの2回目が click ではなく double-click として扱われる。
  // すべてのクリックを個別の click イベントとして受け取るため無効化する。
  tray.setIgnoreDoubleClickEvents(true)

  tray.on('click', (_, bounds) => {
    setLastTrayBounds(bounds)
    togglePopoverAt(settingsStore, bounds)
  })
}
