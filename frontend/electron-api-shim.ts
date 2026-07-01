// electronAPI 互換シム（Tauri 版）。
// 既存レンダラーは window.electronAPI のみに依存しているため、これを Tauri の
// invoke/listen に転送する薄いシムを1枚かませれば、レンダラーを無改修で動かせる。
//
// このファイルを「レンダラーの一番最初」に import すること（main.tsx の先頭）。
//
// 全メソッドが Tauri バックエンド（invoke / listen）へ転送される（スタブ無し）。
//   ✅ COMMAND … 既存 Tauri コマンドへ invoke で転送
//   🔔 EVENT   … Tauri listen へ。emit は Rust 側で実装済み

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
  getLaunchAtLogin: () => invoke("get_launch_at_login"),
  setLaunchAtLogin: (enabled: boolean) =>
    invoke("set_launch_at_login", { enabled }),

  // ---- Timer signals（✅ MAPPED / 一部 STUB） ----
  timerStarted: () => invoke("notif_timer_started"),
  timerStopped: () => invoke("notif_timer_stopped"),
  timerAdjustStartTime: (newStartMs: number) =>
    invoke("notif_timer_adjust", { newStartMs }),
  isTimerRunning: () => invoke("timer_is_running"),

  // ---- Attendance / Whiteboard（✅ MAPPED） ----
  sendAttendance: (text: string) => invoke("attendance_send", { text }),
  teleworkStart: () => invoke("whiteboard_telework_start"),

  // ---- Window（✅ MAPPED） ----
  hideWindow: () => invoke("window_hide"),
  resizeWindow: (width: number, height: number) =>
    invoke("window_resize", { width, height }),

  // ---- Auth（✅ MAPPED） ----
  signInWithSlack: () => invoke("sign_in_with_slack"),
  getAuthStatus: () => invoke("auth_get_status"),
  signOutSlack: () => invoke("auth_sign_out"),

  // ---- Update（✅ MAPPED） ----
  checkForUpdate: () => invoke("update_check"),
  dismissUpdate: (version: string) =>
    invoke("settings_set_dismissed_update_version", { version }),
  installUpdate: () => invoke("update_install"),
  readyToQuit: () => invoke("update_ready_to_quit"),

  // ---- Misc ----
  completeSetup: () => invoke("settings_complete_setup"),
  getHolidays: () => invoke("holidays_get"),
  openUrl: (url: string) => invoke("open_url", { url }),
  getAppVersion: () => invoke("get_app_version"),

  // ---- Events（🔔 Tauri listen へ。emit 側は Rust 実装済み） ----
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
