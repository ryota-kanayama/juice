import type { Session } from './types'

// IPC コントラクト: メインプロセスとレンダラーで共有する契約。
// チャンネル名のリテラル衝突、ハンドラ追加忘れ、引数/戻り値のドリフトを型で防ぐ。

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
  email: string
}

export interface SlackSettings {
  projectCode: string
  projectName: string
}

/**
 * IPC リクエスト/レスポンスのマップ。
 * key = チャンネル名、value = [引数, 戻り値] のタプル。
 * 引数は ipcMain.handle の第2引数（event を除く）を1つにまとめた形を採る
 * （複数引数が必要なケースは object でラップ）。
 */
export interface IpcContract {
  // sessions
  'sessions:get': [yearMonth: string, Session[]]
  'sessions:save': [session: Session, void]
  'sessions:update': [session: Session, void]
  'sessions:delete': [{ id: string; yearMonth: string }, void]

  // settings: theme / notifications / userName
  'settings:getTheme': [void, string]
  'settings:setTheme': [themeId: string, void]
  'settings:getIdleSettings': [void, ToggleSettings]
  'settings:setIdleSettings': [ToggleSettings, void]
  'settings:getElapsedSettings': [void, ToggleSettings]
  'settings:setElapsedSettings': [ToggleSettings, void]
  'settings:getUserName': [void, string]
  'settings:setUserName': [userName: string, void]

  // settings: integrations
  'settings:getWhiteboardSettings': [void, WhiteboardSettings]
  'settings:setWhiteboardSettings': [WhiteboardSettings, void]
  'settings:getSlackSettings': [void, SlackSettings]
  'settings:setSlackSettings': [SlackSettings, void]

  // timer signals
  'timer:started': [void, void]
  'timer:stopped': [void, void]
  'timer:adjustStartTime': [newStartMs: number, void]

  // attendance
  'attendance:send': [text: string, AttendanceSendResult]
  'whiteboard:teleworkStart': [void, void]

  // window
  'window:hide': [void, void]
  'window:resize': [{ width: number; height: number }, void]

  // misc
  'setup:complete': [void, void]
  'holidays:get': [void, Record<string, string>]
  'shell:openUrl': [url: string, void]
}

export type IpcChannel = keyof IpcContract
export type IpcArg<C extends IpcChannel> = IpcContract[C][0]
export type IpcReturn<C extends IpcChannel> = IpcContract[C][1]

/**
 * メインプロセスからレンダラーへの片方向通知（ipcMain.send → ipcRenderer.on）。
 * key = イベント名、value = ペイロード型。
 */
export interface IpcEventContract {
  'theme-changed': string
}

export type IpcEventName = keyof IpcEventContract
export type IpcEventPayload<E extends IpcEventName> = IpcEventContract[E]
