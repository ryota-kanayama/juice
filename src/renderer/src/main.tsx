import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { dailyStore } from './dailyStore'
import { settingsRepository } from './repositories/settingsRepository'
import './assets/index.css'

// テーマを適用する関数
function applyTheme(themeId: string): void {
  document.documentElement.dataset.theme = themeId
}

// 古い日付キーを掃除
dailyStore.pruneOldKeys()

// 起動時の初期テーマ適用 + ライブ更新
settingsRepository.getTheme().then(applyTheme)
settingsRepository.onThemeChanged(applyTheme)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
