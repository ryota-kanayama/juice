// レンダラーと Rust バックエンドで共有する設定・認証まわりのデータ型。
// （旧 Electron の IPC チャンネル契約 IpcContract 等は Tauri 移行時に撤去した。
//  バックエンド呼び出しは frontend/electron-api-shim.ts が Tauri invoke へ転送する。）

export interface AttendanceSendResult {
  ok: boolean
  status: number
  body: string
}

export interface ToggleSettings {
  enabled: boolean
  minutes: number
}

export interface WhiteboardSettings {
  enabled: boolean
}

export interface PomodoroSettings {
  enabled: boolean
}

export interface BreakBehaviorSettings {
  behavior: 'stop' | 'pause'
}

export interface AuthStatus {
  signedIn: boolean
  name?: string
  /** Slack プロフィール画像URL。古いトークン・未取得時は undefined */
  avatarUrl?: string
  /** ISO 8601。signedIn が true のときのみ */
  expiresAt?: string
}
