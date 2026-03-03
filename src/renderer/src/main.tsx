import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/index.css'

// テーマを適用する関数
function applyTheme(themeId: string): void {
  document.documentElement.dataset.theme = themeId
}

// 起動時の初期テーマ適用
window.electronAPI.getTheme().then(applyTheme)

// ライブ更新
window.electronAPI.onThemeChanged(applyTheme)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
