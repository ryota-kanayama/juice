// Juice Tauri PoC — メニューバー常駐 + 非アクティベート NSPanel の検証用。
// 検証ポイント：
//   1. Dock にアイコンを出さずメニューバーだけで常駐できるか
//   2. パネル表示時に「他アプリのフォーカスを奪わない」(non-activating) か
//   3. パネル外をクリックすると自動で閉じる (blur-to-close) か
//   4. パネル内のテキスト入力にキーボード入力できるか
//   5. マルチディスプレイ／別 Space でも現在の画面のトレイ下に出るか

// 移行: データストア（Electron 版 src/main/*.ts の Rust 移植）
mod auth;
mod commands;
mod config;
mod daily_store;
mod fs_util;
mod holidays;
mod integrations;
mod notif_scheduler;
mod notifications;
mod notify;
mod oauth;
// ポップオーバー（main ウィンドウ）の OS 別実装。公開 API は両 OS で揃える。
#[cfg_attr(target_os = "macos", path = "panel/macos.rs")]
#[cfg_attr(not(target_os = "macos"), path = "panel/windows.rs")]
mod panel;
mod quit;
mod release_notes;
mod session_store;
mod settings_store;
mod types;
mod update;

use daily_store::DailyStore;
use notif_scheduler::NotificationEngine;
use session_store::SessionStore;
use settings_store::SettingsStore;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// パネル表示時のアンカー位置（macOS は左下原点のグローバル座標、Windows は物理ピクセル）。
/// ヘッダーをドラッグして動かした後は blur でも閉じずフローティングさせるための判定に使う。
#[derive(Default)]
struct AnchorPos(std::sync::Mutex<Option<(f64, f64)>>);

/// Electron 版と同じデータディレクトリを返す。
/// dev（debug ビルド）は juice-dev、本番は Juice
/// （macOS は ~/Library/Application Support 下、Windows は %APPDATA% 下）。
fn resolve_data_dir() -> PathBuf {
    // テスト/検証用の明示上書き（本番経路には影響しない）
    if let Ok(dir) = std::env::var("JUICE_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let name = if cfg!(debug_assertions) {
        "juice-dev"
    } else {
        "Juice"
    };
    if cfg!(windows) {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        return PathBuf::from(appdata).join(name);
    }
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join("Library/Application Support")
        .join(name)
}

/// Dock にアイコンを出すか（macOS の activation policy）。他 OS では何もしない。
fn set_dock_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        let _ = app.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, visible);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // 単一インスタンス化（最初に登録）。2つ目の起動は即終了させ、常駐トレイ/パネルの
        // 二重化や同一 JSON への同時書き込みを防ぐ。ログイン起動の重複や
        // 「再ログイン時にウインドウ再開」との併発でも1つに保つ。
        // 起動中にもう一度開かれたら、無反応で終わらせずポップオーバーを出す
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Windows では juice:// のコールバックも2つ目の起動として届く。
            // それは deep-link 側で処理するので、パネルは出さない。
            if args.iter().any(|a| a.starts_with("juice://")) {
                return;
            }
            // このコールバックは tokio のワーカースレッドで呼ばれる（#166）
            on_main_thread(app, show_panel_now);
        }));
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    builder
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            commands::sessions_get,
            commands::sessions_save,
            commands::sessions_update,
            commands::sessions_delete,
            commands::daily_get_month,
            commands::daily_get_day,
            commands::daily_set_day,
            commands::daily_import_legacy,
            commands::daily_prune,
            commands::settings_get_theme,
            commands::settings_set_theme,
            commands::settings_get_idle,
            commands::settings_set_idle,
            commands::settings_get_elapsed,
            commands::settings_set_elapsed,
            commands::settings_get_pomodoro,
            commands::settings_set_pomodoro,
            commands::settings_get_whiteboard,
            commands::settings_set_whiteboard,
            commands::settings_get_break_behavior,
            commands::settings_set_break_behavior,
            commands::settings_get_main_project_code,
            commands::settings_set_main_project_code,
            commands::settings_get_dismissed_update_version,
            commands::settings_set_dismissed_update_version,
            commands::settings_is_setup_completed,
            commands::settings_complete_setup,
            commands::notif_timer_started,
            commands::notif_timer_stopped,
            commands::notif_timer_adjust,
            commands::record_activity,
            commands::notif_test,
            commands::holidays_get,
            commands::auth_get_status,
            commands::auth_sign_out,
            commands::attendance_send,
            commands::whiteboard_telework_start,
            commands::window_hide,
            commands::open_url,
            commands::get_app_version,
            commands::window_resize,
            commands::open_calendar_window,
            commands::back_to_main_panel,
            commands::timer_is_running,
            commands::get_launch_at_login,
            commands::set_launch_at_login,
            commands::sign_in_with_slack,
            commands::update_check,
            commands::update_install,
            commands::update_ready_to_quit,
            commands::update_pending,
            commands::release_notes_current,
            commands::release_notes_pending,
            commands::release_notes_mark_seen,
            commands::open_release_notes_window,
            commands::open_release_notes_pending_window,
            commands::close_release_notes_window,
        ])
        .setup(|app| {
            // データディレクトリは Electron 版と互換（dev=juice-dev / 本番=Juice）。
            let data_dir = resolve_data_dir();
            let _ = std::fs::create_dir_all(&data_dir);
            app.manage(SessionStore::new(data_dir.clone()));
            app.manage(DailyStore::new(data_dir.clone()));
            app.manage(SettingsStore::new(data_dir.clone()));
            app.manage(NotificationEngine::new());
            app.manage(holidays::HolidaysClient::new());
            app.manage(auth::AuthStore::new(data_dir));
            app.manage(oauth::PendingState::default());
            app.manage(quit::PrepareQuitAck::default());
            app.manage(quit::QuitGate::default());
            app.manage(update::LastChecked::default());
            app.manage(update::InstallGate::default());
            app.manage(AnchorPos::default());

            // juice://auth コールバック（Slack サインイン）を deep-link で受ける。
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Windows の dev ビルドはインストーラを通らずスキームが未登録なので、ここで登録する
                // （パッケージ版は NSIS インストーラが登録する）。
                #[cfg(all(windows, debug_assertions))]
                if let Err(e) = app.deep_link().register_all() {
                    eprintln!("[juice] deep-link register failed: {e}");
                }
                let cb_handle = app.app_handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        oauth::handle_callback(&cb_handle, url.as_str());
                    }
                });
            }

            // メニューバー常駐アプリ：Dock にアイコンを出さない（Electron の app.dock.hide 相当）
            set_dock_visible(app.app_handle(), false);

            let handle = app.app_handle();
            // アイドル監視ループを開始（engine 登録後）
            notif_scheduler::init(handle);
            // 起動時 + 6時間ごとの更新確認（Electron 版 startPeriodicCheck 相当）
            update::start_periodic_check(handle);
            panel::init(handle);
            build_tray(handle)?;
            // 初回起動（セットアップ未完了）はセットアップ窓を出す（Electron 版と同じ）
            if !handle.state::<SettingsStore>().is_setup_completed() {
                open_aux_window(handle, "setup", "setup", "Juice — セットアップ", 480.0, 600.0, false);
            }
            // 更新後の初回起動なら変更点を出す（セットアップ窓とは排他: 新規インストールでは出ない）
            maybe_show_release_notes(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// トレイ「終了」。稼働中の区間を renderer に保存させてから終了する。終了処理中の連打は無視する。
fn quit_after_save(app: &AppHandle) {
    if !app.state::<quit::QuitGate>().try_begin() {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        quit::wait_for_renderer(&app).await;
        app.exit(0);
    });
}

/// メニューバーのトレイアイコンを構築。左クリックでトグル、右クリックで終了メニュー。
fn build_tray(app_handle: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItemBuilder::with_id("settings", "設定").build(app_handle)?;
    let quit = MenuItemBuilder::with_id("quit", "終了").build(app_handle)?;
    let menu = MenuBuilder::new(app_handle)
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    // メニューバー専用のトレイアイコン（黒シルエット）。template 指定で macOS が
    // ライト/ダークに合わせて自動反転する。アプリ(Dock)アイコンとは別素材を使う。
    // Windows は反転されず暗いタスクバーで見えなくなるため、カラーのアプリアイコンを使う。
    #[cfg(target_os = "macos")]
    let tray_bytes: &[u8] = include_bytes!("../icons/tray.png");
    #[cfg(not(target_os = "macos"))]
    let tray_bytes: &[u8] = include_bytes!("../icons/32x32.png");
    let tray_icon = tauri::image::Image::from_bytes(tray_bytes).expect("valid tray icon");

    TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .icon_as_template(true) // ダーク/ライトメニューバーに追従
        .tooltip("Juice")
        .menu(&menu)
        .show_menu_on_left_click(false) // 左クリックはメニューでなくトグルに使う
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => open_settings(app),
            "quit" => quit_after_save(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // ★ positioner にトレイ位置を記録させる（全イベントで必須）
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_panel(tray.app_handle());
            }
        })
        .build(app_handle)?;
    Ok(())
}

/// 設定 / セットアップ用の通常ウィンドウを開く（既にあれば前面化）。
/// メインは Accessory(Dock 非表示) の NSPanel だが、付属ウィンドウは前面化・フォーカスを
/// 効かせるため一時的に Regular に切替える。全付属ウィンドウを閉じたら Accessory に戻す。
fn open_aux_window(
    app: &AppHandle,
    label: &str,
    hash: &str,
    title: &str,
    w: f64,
    h: f64,
    resizable: bool,
) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    set_dock_visible(app, true);
    let url = tauri::WebviewUrl::App(format!("index.html#{hash}").into());
    match tauri::WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(w, h)
        .resizable(resizable)
        .build()
    {
        Ok(win) => {
            let _ = win.set_focus();
            let handle = app.clone();
            win.on_window_event(move |ev| {
                if matches!(ev, tauri::WindowEvent::Destroyed) {
                    revert_activation_policy_if_no_aux(&handle);
                    show_panel_if_pending(&handle);
                }
            });
        }
        Err(e) => eprintln!("[juice] open {label} window failed: {e}"),
    }
}

/// 付属ウィンドウが1つも無ければ Accessory（Dock 非表示）に戻す。
fn revert_activation_policy_if_no_aux(app: &AppHandle) {
    let has_aux = app.get_webview_window("settings").is_some()
        || app.get_webview_window("setup").is_some()
        || app.get_webview_window("calendar").is_some()
        || app.get_webview_window("release-notes").is_some()
        || app.get_webview_window("release-notes-pending").is_some();
    if !has_aux {
        set_dock_visible(app, false);
    }
}

/// 更新後の初回起動なら「変更点」ウィンドウを出す。
///
/// 見せるものが無い場合（節が無い・空・新規インストール・ダウングレード）はその場で
/// last_seen_version を記録して終わる。見せる場合の記録は、ウィンドウが中身を描画
/// できた時点でフロントから release_notes_mark_seen を呼んで行う。
fn maybe_show_release_notes(app: &AppHandle) {
    let current = app.package_info().version.to_string();
    let store = app.state::<SettingsStore>();
    if store.get_last_seen_version() == current {
        return;
    }
    let entries = release_notes::entries_since_last_seen(
        &store.get_last_seen_version(),
        &current,
        store.is_setup_completed(),
    );
    if entries.is_empty() {
        let _ = store.set_last_seen_version(&current);
        return;
    }
    open_release_notes(app);
}

/// Slack サインインのコールバックを受けたあと、サインインを始めた画面を前に出す。
/// サインインはセットアップ・設定・パネルのいずれかから始まるので、開いているものを
/// この順で探し、どれも無ければパネルを出す。
///
/// Windows ではコールバックが2つ目の起動（single-instance）経由で別スレッドから届くため、
/// メインスレッドで行う。
pub fn show_after_sign_in(app: &AppHandle) {
    on_main_thread(app, |app| {
        for label in ["setup", "settings"] {
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
                return;
            }
        }
        show_panel_now(app);
    });
}

/// メインスレッドで f を実行する。macOS の AppKit（NSPanel の配置など）はメインスレッド
/// 以外から触ると落ちるため、別スレッドから呼ばれうる表示処理はこれを通す（#166）。
pub(crate) fn on_main_thread(app: &AppHandle, f: impl FnOnce(&AppHandle) + Send + 'static) {
    let handle = app.clone();
    if let Err(e) = app.run_on_main_thread(move || f(&handle)) {
        eprintln!("[juice] run_on_main_thread failed: {e}");
    }
}

/// 設定ウィンドウを開く（トレイ「設定」から）。
pub fn open_settings(app: &AppHandle) {
    open_aux_window(app, "settings", "settings", "Juice 設定", 440.0, 500.0, false);
}

/// カレンダーウィンドウを開く。通常のアプリウィンドウ（リサイズ可）。
pub fn open_calendar(app: &AppHandle) {
    open_aux_window(app, "calendar", "calendar", "Juice カレンダー", 1000.0, 680.0, true);
}

/// 更新後の「変更点」ウィンドウを開く。
pub fn open_release_notes(app: &AppHandle) {
    open_aux_window(app, "release-notes", "release-notes", "Juice の変更点", 560.0, 640.0, true);
}

/// 更新前の「次の更新の変更点」ウィンドウを開く。
/// 更新後のウィンドウとは label を分ける。1つの label を使い回すと、close() の完了前に
/// open_aux_window が既存ウィンドウを見つけて前面化するだけになり、古いモードのまま残る。
pub fn open_release_notes_pending(app: &AppHandle) {
    open_aux_window(
        app,
        "release-notes-pending",
        "release-notes-pending",
        "次の更新の変更点",
        560.0,
        640.0,
        true,
    );
}

/// トレイアイコンの真下にパネルを表示／非表示でトグルする。
fn toggle_panel(app: &AppHandle) {
    if panel::is_visible(app) {
        panel::hide(app);
        return;
    }
    // トレイを押した瞬間の blur で閉じたばかりなら、それが「閉じる」操作だったので開き直さない
    if panel::hidden_by_blur_just_now() {
        return;
    }
    show_panel(app, PanelPlacement::Cursor);
}

/// 付属ウィンドウを閉じ終えたらパネルを出す、という予約フラグ。
/// パネルを先に出してからウィンドウを閉じると、キーウィンドウの移動で
/// windowDidResignKey が飛び blur-to-close で即座に閉じてしまうため、
/// 「閉じ終えてから出す」順序を守るために使う。
static PENDING_BACK_TO_PANEL: AtomicBool = AtomicBool::new(false);

/// 次にウィンドウが閉じたらパネルを出すよう予約する。
pub fn reserve_back_to_panel() {
    PENDING_BACK_TO_PANEL.store(true, Ordering::SeqCst);
}

/// 予約されていればパネルを表示し、タイマー画面へ切り替えるよう通知する。
fn show_panel_if_pending(app: &AppHandle) {
    if PENDING_BACK_TO_PANEL.swap(false, Ordering::SeqCst) {
        show_panel_now(app);
    }
}

/// この時刻（epoch ミリ秒）までは blur-to-close を無視する。
/// 「戻る」でパネルを出した直後は、付属ウィンドウが消えたことによる activation policy の
/// 切り替え（Regular → Accessory）でアプリが非アクティブになり windowDidResignKey が
/// 飛ぶ。出したそばから閉じてしまうため、この間だけ blur による自動クローズを止める。
static BLUR_CLOSE_SUPPRESSED_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

/// 表示直後の自動クローズ抑止時間。policy 切り替えが落ち着くまでの猶予。
const BLUR_CLOSE_SUPPRESS_MS: u64 = 700;

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 抑止期間中か。
pub(crate) fn blur_close_suppressed() -> bool {
    now_ms() < BLUR_CLOSE_SUPPRESSED_UNTIL_MS.load(Ordering::SeqCst)
}

/// パネルを前回の位置に出し、新たに表示したときだけタイマー画面へ切り替えるよう通知する。
pub fn show_panel_now(app: &AppHandle) {
    BLUR_CLOSE_SUPPRESSED_UNTIL_MS.store(now_ms() + BLUR_CLOSE_SUPPRESS_MS, Ordering::SeqCst);
    if show_panel(app, PanelPlacement::LastAnchor) {
        use tauri::Emitter;
        let _ = app.emit("navigate", "timer");
    }
}

/// パネルをどこに出すか。
pub enum PanelPlacement {
    /// カーソルのいる画面のメニューバー直下（トレイクリックと同じ挙動）
    Cursor,
    /// 前回出した位置に戻す。記録が無ければ Cursor と同じ扱い
    LastAnchor,
}

/// パネルを配置して表示する。既に表示中なら false を返す（何もしない）。
pub fn show_panel(app: &AppHandle, placement: PanelPlacement) -> bool {
    if panel::is_visible(app) {
        return false;
    }
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    let restored = matches!(placement, PanelPlacement::LastAnchor) && panel::restore_position(&window);
    if !restored {
        panel::position_at_cursor(&window);
    }
    panel::show(app);
    true
}

