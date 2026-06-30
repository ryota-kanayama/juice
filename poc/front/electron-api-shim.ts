// electronAPI 互換シム（Tauri 版）。
// 既存レンダラーは window.electronAPI のみに依存しているため、これを Tauri の
// invoke/listen に転送する薄いシムを1枚かませれば、レンダラーを無改修で動かせる。
//
// このファイルを「レンダラーの一番最初」に import すること（main.tsx の先頭）。
//
// メソッドは3分類：
//   ✅ MAPPED  … 既存 Tauri コマンドへ転送
//   🟡 STUB    … バックエンド未移植。安全な既定値を返す（後の Phase で実装）
//   🔔 EVENT   … Tauri listen へ。emit 側未実装のものは購読だけ張って no-op

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** onXxx(callback) → () => void の購読解除を Tauri listen で実現するヘルパー。 */
function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  listen<T>(event, (e) => callback(e.payload)).then((un) => {
    if (cancelled) un();
    else unlisten = un;
  });
  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}

/** 未実装メソッドの目印（コンソールに一度だけ警告）。 */
const warned = new Set<string>();
function stub<T>(name: string, value: T): T {
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[electronAPI shim] '${name}' は未移植のためスタブ応答`);
  }
  return value;
}

const electronAPI = {
  // ---- Sessions（✅ MAPPED） ----
  getSessions: (yearMonth: string) => invoke("sessions_get", { yearMonth }),
  saveSession: (session: unknown) => invoke("sessions_save", { session }),
  updateSession: (session: unknown) => invoke("sessions_update", { session }),
  deleteSession: (id: string, yearMonth: string) =>
    invoke("sessions_delete", { id, yearMonth }),

  // ---- Daily（✅ MAPPED） ----
  getDailyMonth: (yearMonth: string) => invoke("daily_get_month", { yearMonth }),
  setDailyDay: (date: string, patch: unknown) =>
    invoke("daily_set_day", { date, patch }),
  pruneDaily: (keepDays: number) => invoke("daily_prune", { keepDays }),
  importLegacyDaily: (entries: unknown) =>
    invoke("daily_import_legacy", { entries }),

  // ---- Settings: Theme/Notifications（✅ MAPPED） ----
  getTheme: () => invoke("settings_get_theme"),
  setTheme: (themeId: string) => invoke("settings_set_theme", { themeId }),
  getIdleSettings: () => invoke("settings_get_idle"),
  setIdleSettings: (enabled: boolean, minutes: number) =>
    invoke("settings_set_idle", { enabled, minutes }),
  getElapsedSettings: () => invoke("settings_get_elapsed"),
  setElapsedSettings: (enabled: boolean, minutes: number) =>
    invoke("settings_set_elapsed", { enabled, minutes }),
  getPomodoroSettings: () => invoke("settings_get_pomodoro"),
  setPomodoroSettings: (enabled: boolean) =>
    invoke("settings_set_pomodoro", { enabled }),

  // ---- Settings: Integrations（一部 STUB） ----
  getWhiteboardSettings: () => invoke("settings_get_whiteboard"),
  setWhiteboardSettings: (enabled: boolean) =>
    invoke("settings_set_whiteboard", { enabled }),
  getBreakBehaviorSettings: () => invoke("settings_get_break_behavior"),
  setBreakBehaviorSettings: (behavior: "stop" | "pause") =>
    invoke("settings_set_break_behavior", { behavior }),
  getMainProjectCode: () => invoke("settings_get_main_project_code"),
  setMainProjectCode: (code: string) =>
    invoke("settings_set_main_project_code", { code }),
  // 🟡 ログイン時起動（OS 設定）は未移植
  getLaunchAtLogin: () => stub("getLaunchAtLogin", Promise.resolve(false)),
  setLaunchAtLogin: (_enabled: boolean) =>
    stub("setLaunchAtLogin", Promise.resolve()),

  // ---- Timer signals（✅ MAPPED / 一部 STUB） ----
  timerStarted: () => invoke("notif_timer_started"),
  timerStopped: () => invoke("notif_timer_stopped"),
  timerAdjustStartTime: (newStartMs: number) =>
    invoke("notif_timer_adjust", { newStartMs }),
  // 🟡 main 側のタイマー稼働判定コマンドは未公開
  isTimerRunning: () => stub("isTimerRunning", Promise.resolve(false)),

  // ---- Attendance / Whiteboard（✅ MAPPED） ----
  sendAttendance: (text: string) => invoke("attendance_send", { text }),
  teleworkStart: () => invoke("whiteboard_telework_start"),

  // ---- Window（hide=✅ MAPPED / resize=🟡 STUB） ----
  hideWindow: () => invoke("window_hide"),
  // 🟡 稼働中リサイズ(560×420)は renderer から未呼出。将来 Rust 側でタイマー連動実装。
  resizeWindow: (_width: number, _height: number) =>
    stub("resizeWindow", Promise.resolve()),

  // ---- Auth（一部 STUB） ----
  // 🟡 OAuth サインインは未移植
  signInWithSlack: () => stub("signInWithSlack", Promise.resolve()),
  getAuthStatus: () => invoke("auth_get_status"),
  signOutSlack: () => invoke("auth_sign_out"),

  // ---- Update（🟡 STUB：自動アップデート未移植） ----
  checkForUpdate: () =>
    stub("checkForUpdate", Promise.resolve({ hasUpdate: false } as unknown)),
  dismissUpdate: (_version: string) => stub("dismissUpdate", Promise.resolve()),
  installUpdate: () => stub("installUpdate", Promise.resolve()),
  readyToQuit: () => stub("readyToQuit", Promise.resolve()),

  // ---- Misc ----
  completeSetup: () => invoke("settings_complete_setup"),
  getHolidays: () => invoke("holidays_get"),
  openUrl: (url: string) => invoke("open_url", { url }),
  getAppVersion: () => invoke("get_app_version"),

  // ---- Events（🔔 listen へ。emit 側未実装は購読のみ） ----
  onThemeChanged: (cb: (themeId: string) => void) =>
    subscribe<string>("theme-changed", cb),
  onAuthChanged: (cb: (status: unknown) => void) =>
    subscribe<unknown>("auth-changed", cb),
  onUpdateAvailable: (cb: (info: unknown) => void) =>
    subscribe<unknown>("update-available", cb),
  onUpdateProgress: (cb: (p: unknown) => void) =>
    subscribe<unknown>("update-progress", cb),
  onUpdatePrepareQuit: (cb: () => void) =>
    subscribe<void>("update-prepare-quit", () => cb()),
};

// レンダラーが参照する window.electronAPI を提供する。
(window as unknown as { electronAPI: typeof electronAPI }).electronAPI =
  electronAPI;

export {};
