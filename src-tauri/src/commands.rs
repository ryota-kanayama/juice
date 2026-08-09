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
pub fn settings_set_theme(
    app: tauri::AppHandle,
    theme_id: String,
    store: State<'_, SettingsStore>,
) -> CmdResult<()> {
    use tauri::Emitter;
    map(store.set_theme(&theme_id))?;
    // 全ウィンドウへライブ反映（Electron 版 broadcastThemeToAll 相当）
    let _ = app.emit("theme-changed", &theme_id);
    Ok(())
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
pub fn settings_complete_setup(
    app: tauri::AppHandle,
    store: State<'_, SettingsStore>,
) -> CmdResult<()> {
    use tauri::Manager;
    map(store.complete_setup())?;
    // セットアップ窓を閉じる（Destroyed イベントで Accessory ポリシーに戻る）
    if let Some(win) = app.get_webview_window("setup") {
        let _ = win.close();
    }
    Ok(())
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
pub fn auth_sign_out(app: tauri::AppHandle, store: State<'_, crate::auth::AuthStore>) {
    use tauri::Emitter;
    store.clear_token();
    let status = store.get_status(chrono::Utc::now().timestamp_millis());
    let _ = app.emit("auth-changed", &status);
}

/// ブラウザで Slack サインインを開始する（juice://auth コールバックで完了）。
#[tauri::command]
pub fn sign_in_with_slack(app: tauri::AppHandle) -> CmdResult<()> {
    map(crate::oauth::start_sign_in(&app))
}

// ---- アップデート（Electron 版 update:check / install / ready-to-quit 相当） ----

#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> CmdResult<crate::update::UpdateInfo> {
    crate::update::check_for_update(&app).await
}

#[tauri::command]
pub async fn update_install(app: tauri::AppHandle) {
    crate::update::install(&app).await;
}

/// 直近の更新チェック結果を引き直す。レンダラーはマウント時にこれを呼び、
/// 起動時チェックの update-available を取りこぼしていても更新の有無を知る。
#[tauri::command]
pub fn update_pending(
    state: State<'_, crate::update::LastChecked>,
    store: State<'_, SettingsStore>,
) -> Option<crate::update::UpdateInfo> {
    crate::update::pending_update(state.get(), &store.get_dismissed_update_version())
}

#[tauri::command]
pub fn update_ready_to_quit(app: tauri::AppHandle) {
    crate::update::notify_renderer_ready(&app);
}

// ---- 勤怠 / ホワイトボード ----

#[tauri::command]
pub async fn attendance_send(app: tauri::AppHandle, text: String) -> crate::integrations::HttpResult {
    crate::integrations::send_attendance(&app, &text).await
}

#[tauri::command]
pub async fn whiteboard_telework_start(app: tauri::AppHandle) {
    crate::integrations::send_whiteboard(&app, "telework").await;
}

// ---- ウィンドウ / 外部連携（Electron 版 window:hide / shell.openExternal / app.getVersion 相当） ----

/// ポップオーバー（NSPanel）を隠す。blur-to-close と同じ `order_out` を使う。
#[tauri::command]
pub fn window_hide(app: tauri::AppHandle) {
    use tauri_nspanel::ManagerExt;
    if let Ok(panel) = app.get_webview_panel("main") {
        panel.order_out(None);
    }
}

/// 外部 URL を既定ブラウザで開く。
/// 任意スキーム（file:/javascript: 等）の起動を防ぐため http/https のみ許可する。
#[tauri::command]
pub fn open_url(app: tauri::AppHandle, url: String) -> CmdResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let lower = url.trim_start().to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(format!("許可されないスキームです: {url}"));
    }
    map(app.opener().open_url(url, None::<&str>))
}

/// アプリのバージョン（tauri.conf.json の version）を返す。
#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

/// ポップオーバー（NSPanel）をリサイズする。Electron 版 resizePopover 相当。
#[tauri::command]
pub fn window_resize(app: tauri::AppHandle, width: f64, height: f64) -> CmdResult<()> {
    use tauri::{LogicalSize, Manager};
    if let Some(win) = app.get_webview_window("main") {
        map(win.set_size(LogicalSize::new(width, height)))
    } else {
        Err("main window not found".into())
    }
}

/// カレンダー専用ウィンドウを開く（既にあれば前面化）。
#[tauri::command]
pub fn open_calendar_window(app: tauri::AppHandle) {
    crate::open_calendar(&app);
}

// ---- リリースノート ----

/// ウィンドウが読むノート。範囲ルールが空なら今のバージョンの節だけを返す
/// （設定から開き直したときに何も出ないのを防ぐ）。
#[tauri::command]
pub fn release_notes_current(
    app: tauri::AppHandle,
    store: State<'_, SettingsStore>,
) -> Vec<crate::release_notes::ReleaseNoteEntry> {
    let current = app.package_info().version.to_string();
    crate::release_notes::entries_for_display(
        &store.get_last_seen_version(),
        &current,
        store.is_setup_completed(),
    )
}

/// 直近のチェック結果から、更新前に見せるノートを組み立てる。
/// 空になるのは「チェックが未実行」か「本文が空」のとき。
/// ウィンドウを開くかどうかの判定も同じ結果を使う（判定を二重に持たない）。
fn pending_entries(
    state: &crate::update::LastChecked,
) -> Vec<crate::release_notes::ReleaseNoteEntry> {
    match state.get() {
        Some(info) if !info.notes.trim().is_empty() => {
            vec![crate::release_notes::ReleaseNoteEntry {
                version: info.latest_version,
                date: String::new(),
                body: info.notes,
            }]
        }
        _ => Vec::new(),
    }
}

/// これから入るバージョンのノート。GitHub から取得済みの本文をそのまま渡す。
#[tauri::command]
pub fn release_notes_pending(
    state: State<'_, crate::update::LastChecked>,
) -> Vec<crate::release_notes::ReleaseNoteEntry> {
    pending_entries(&state)
}

/// 「変更点を見せた」ことを記録する。ウィンドウが中身を描画できた時点で呼ばれる。
#[tauri::command]
pub fn release_notes_mark_seen(
    app: tauri::AppHandle,
    store: State<'_, SettingsStore>,
) -> CmdResult<()> {
    let current = app.package_info().version.to_string();
    map(store.set_last_seen_version(&current))
}

#[tauri::command]
pub fn open_release_notes_window(app: tauri::AppHandle) {
    crate::open_release_notes(&app);
}

/// 更新前のノートのウィンドウを開く。
/// 見せる本文が無いとき（チェック未実行・本文が空）は空のウィンドウが出るだけなので開かない。
#[tauri::command]
pub fn open_release_notes_pending_window(
    app: tauri::AppHandle,
    state: State<'_, crate::update::LastChecked>,
) {
    if pending_entries(&state).is_empty() {
        return;
    }
    crate::open_release_notes_pending(&app);
}

/// リリースノートのウィンドウを閉じる（パネル内の「閉じる」ボタンから）。
/// 更新前と更新後のウィンドウは共存しうるので、呼び出し元のウィンドウだけを閉じる。
#[tauri::command]
pub fn close_release_notes_window(window: tauri::Window) {
    let _ = window.close();
}

/// カレンダーウィンドウを閉じてポップオーバーへ戻る。
/// ポップオーバーが隠れていたときだけ表示し、タイマー画面に切り替えるよう通知する。
/// 既に表示中なら位置も表示中の画面も動かさず、カレンダーウィンドウを閉じるだけにする。
///
/// パネルの表示はウィンドウを閉じ終えてから行う（先に出すとキーウィンドウの移動で
/// blur-to-close が発火し、出した直後に閉じてしまう）。
#[tauri::command]
pub fn back_to_main_panel(app: tauri::AppHandle) {
    use tauri::Manager;
    match app.get_webview_window("calendar") {
        Some(win) => {
            crate::reserve_back_to_panel();
            let _ = win.close();
        }
        // ウィンドウが無ければ閉じる契機も無いので、その場で出す
        None => crate::show_panel_now(&app),
    }
}

/// タイマー稼働中か（再起動前の確認文言切替などに使う）。
#[tauri::command]
pub fn timer_is_running(app: tauri::AppHandle) -> bool {
    crate::notif_scheduler::is_timer_running(&app)
}

// ---- ログイン時起動（Electron 版 app.getLoginItemSettings / setLoginItemSettings 相当） ----

#[tauri::command]
pub fn get_launch_at_login(app: tauri::AppHandle) -> CmdResult<bool> {
    use tauri_plugin_autostart::ManagerExt;
    map(app.autolaunch().is_enabled())
}

#[tauri::command]
pub fn set_launch_at_login(app: tauri::AppHandle, enabled: bool) -> CmdResult<()> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    map(if enabled {
        manager.enable()
    } else {
        manager.disable()
    })
}
