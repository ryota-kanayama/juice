// Tauri command 層。各ストア（管理ステート）を IPC として renderer に公開する。
// Electron 版の ipcMain.handle('sessions:get' …) 等に対応。
// StoreError は文字列に変換して返す（フロントは reject として受ける）。

use crate::daily_store::{DailyStore, LegacyEntry};
use crate::session_store::SessionStore;
use crate::settings_store::{BreakBehavior, SettingsStore};
use crate::types::Session;
use serde::Serialize;
use serde_json::Value;
use tauri::State;

type CmdResult<T> = Result<T, String>;

fn map<T, E: std::fmt::Display>(r: Result<T, E>) -> CmdResult<T> {
    r.map_err(|e| e.to_string())
}

// ---- Sessions ----

#[tauri::command]
pub fn sessions_get(year_month: String, store: State<'_, SessionStore>) -> CmdResult<Vec<Session>> {
    map(store.get_sessions(&year_month))
}

#[tauri::command]
pub fn sessions_save(session: Session, store: State<'_, SessionStore>) -> CmdResult<()> {
    map(store.save_session(session))
}

#[tauri::command]
pub fn sessions_update(session: Session, store: State<'_, SessionStore>) -> CmdResult<()> {
    map(store.update_session(session))
}

#[tauri::command]
pub fn sessions_delete(
    id: String,
    year_month: String,
    store: State<'_, SessionStore>,
) -> CmdResult<()> {
    map(store.delete_session(&id, &year_month))
}

// ---- Daily ----

#[derive(Serialize)]
pub struct DailyMonthResp {
    pub version: i64,
    pub days: serde_json::Map<String, Value>,
}

#[tauri::command]
pub fn daily_get_month(year_month: String, store: State<'_, DailyStore>) -> CmdResult<DailyMonthResp> {
    let m = map(store.get_month(&year_month))?;
    Ok(DailyMonthResp {
        version: m.version,
        days: m.days,
    })
}

#[tauri::command]
pub fn daily_get_day(date: String, store: State<'_, DailyStore>) -> CmdResult<Option<Value>> {
    map(store.get_day(&date))
}

#[tauri::command]
pub fn daily_set_day(date: String, patch: Value, store: State<'_, DailyStore>) -> CmdResult<()> {
    map(store.set_day(&date, patch))
}

#[tauri::command]
pub fn daily_import_legacy(
    entries: Vec<LegacyEntry>,
    store: State<'_, DailyStore>,
) -> CmdResult<()> {
    map(store.import_legacy(entries))
}

#[tauri::command]
pub fn daily_prune(keep_days: i64, store: State<'_, DailyStore>) -> CmdResult<()> {
    map(store.prune(keep_days))
}

// ---- Settings ----

#[derive(Serialize)]
pub struct ToggleMinutes {
    pub enabled: bool,
    pub minutes: i64,
}

#[derive(Serialize)]
pub struct Enabled {
    pub enabled: bool,
}

#[derive(Serialize)]
pub struct BreakBehaviorResp {
    pub behavior: BreakBehavior,
}

#[tauri::command]
pub fn settings_get_theme(store: State<'_, SettingsStore>) -> String {
    store.get_theme()
}

#[tauri::command]
pub fn settings_set_theme(theme_id: String, store: State<'_, SettingsStore>) -> CmdResult<()> {
    map(store.set_theme(&theme_id))
}

#[tauri::command]
pub fn settings_get_idle(store: State<'_, SettingsStore>) -> ToggleMinutes {
    let (enabled, minutes) = store.get_idle_settings();
    ToggleMinutes { enabled, minutes }
}

#[tauri::command]
pub fn settings_set_idle(
    enabled: bool,
    minutes: i64,
    store: State<'_, SettingsStore>,
) -> CmdResult<()> {
    map(store.set_idle_settings(enabled, minutes))
}

#[tauri::command]
pub fn settings_get_elapsed(store: State<'_, SettingsStore>) -> ToggleMinutes {
    let (enabled, minutes) = store.get_elapsed_settings();
    ToggleMinutes { enabled, minutes }
}

#[tauri::command]
pub fn settings_set_elapsed(
    enabled: bool,
    minutes: i64,
    store: State<'_, SettingsStore>,
) -> CmdResult<()> {
    map(store.set_elapsed_settings(enabled, minutes))
}

#[tauri::command]
pub fn settings_get_pomodoro(store: State<'_, SettingsStore>) -> Enabled {
    Enabled {
        enabled: store.get_pomodoro_enabled(),
    }
}

#[tauri::command]
pub fn settings_set_pomodoro(enabled: bool, store: State<'_, SettingsStore>) -> CmdResult<()> {
    map(store.set_pomodoro_enabled(enabled))
}

#[tauri::command]
pub fn settings_get_whiteboard(store: State<'_, SettingsStore>) -> Enabled {
    Enabled {
        enabled: store.get_whiteboard_enabled(),
    }
}

#[tauri::command]
pub fn settings_set_whiteboard(enabled: bool, store: State<'_, SettingsStore>) -> CmdResult<()> {
    map(store.set_whiteboard_enabled(enabled))
}

#[tauri::command]
pub fn settings_get_break_behavior(store: State<'_, SettingsStore>) -> BreakBehaviorResp {
    BreakBehaviorResp {
        behavior: store.get_break_behavior(),
    }
}

#[tauri::command]
pub fn settings_set_break_behavior(
    behavior: BreakBehavior,
    store: State<'_, SettingsStore>,
) -> CmdResult<()> {
    map(store.set_break_behavior(behavior))
}

#[tauri::command]
pub fn settings_get_main_project_code(store: State<'_, SettingsStore>) -> String {
    store.get_main_project_code()
}

#[tauri::command]
pub fn settings_set_main_project_code(code: String, store: State<'_, SettingsStore>) -> CmdResult<()> {
    map(store.set_main_project_code(&code))
}

#[tauri::command]
pub fn settings_get_dismissed_update_version(store: State<'_, SettingsStore>) -> String {
    store.get_dismissed_update_version()
}

#[tauri::command]
pub fn settings_set_dismissed_update_version(
    version: String,
    store: State<'_, SettingsStore>,
) -> CmdResult<()> {
    map(store.set_dismissed_update_version(&version))
}

#[tauri::command]
pub fn settings_is_setup_completed(store: State<'_, SettingsStore>) -> bool {
    store.is_setup_completed()
}

#[tauri::command]
pub fn settings_complete_setup(store: State<'_, SettingsStore>) -> CmdResult<()> {
    map(store.complete_setup())
}

// ---- 通知スケジューラ（Electron 版 timer:started/stopped/adjust + activity 相当） ----

#[tauri::command]
pub fn notif_timer_started(app: tauri::AppHandle) {
    crate::notif_scheduler::on_timer_started(&app);
}

#[tauri::command]
pub fn notif_timer_stopped(app: tauri::AppHandle) {
    crate::notif_scheduler::on_timer_stopped(&app);
}

#[tauri::command]
pub fn notif_timer_adjust(new_start_ms: i64, app: tauri::AppHandle) {
    crate::notif_scheduler::on_timer_adjust(&app, new_start_ms);
}

#[tauri::command]
pub fn record_activity(app: tauri::AppHandle) {
    crate::notif_scheduler::record_activity(&app);
}

#[tauri::command]
pub fn notif_test(app: tauri::AppHandle) {
    crate::notif_scheduler::show_test(&app);
}

// ---- 外部 API: 祝日 ----

#[tauri::command]
pub async fn holidays_get(
    client: State<'_, crate::holidays::HolidaysClient>,
) -> CmdResult<std::collections::HashMap<String, String>> {
    Ok(client.get().await)
}

// ---- 認証 ----

#[tauri::command]
pub fn auth_get_status(store: State<'_, crate::auth::AuthStore>) -> crate::auth::AuthStatus {
    store.get_status(chrono::Utc::now().timestamp_millis())
}

#[tauri::command]
pub fn auth_sign_out(store: State<'_, crate::auth::AuthStore>) {
    store.clear_token();
}
