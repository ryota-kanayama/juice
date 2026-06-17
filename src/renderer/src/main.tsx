import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { migrateLegacyDailyData } from './daily/migrateLegacy'
import { dailyRepository } from './repositories/dailyRepository'
import { settingsRepository } from './repositories/settingsRepository'
import { applyTheme } from './theme/applyTheme'
import './assets/index.css'

async function bootstrap(): Promise<void> {
  // localStorage の日次データを JSON ストアへ一度だけ移行し、古い日付を掃除してから描画する。
  // 失敗しても描画は止めない（次回起動で再試行される）。
  try {
    await migrateLegacyDailyData()
    await dailyRepository.prune(90)
  } catch (err) {
    console.error('日次データの移行/掃除に失敗しました:', err)
  }

  // 起動時の初期テーマ適用 + ライブ更新
  settingsRepository.getTheme().then(applyTheme)
  settingsRepository.onThemeChanged(applyTheme)

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
