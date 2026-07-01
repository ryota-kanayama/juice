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
mod daily_store;
mod holidays;
mod integrations;
mod notif_scheduler;
mod notifications;
mod oauth;
mod session_store;
mod settings_store;
mod types;
mod update;

use daily_store::DailyStore;
use notif_scheduler::NotificationEngine;
use session_store::SessionStore;
use settings_store::SettingsStore;
use std::path::PathBuf;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindow,
};
use tauri_nspanel::{
    cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, ManagerExt, WebviewWindowExt,
};
// Tauri の set_position は macOS マルチモニタ座標バグ(tauri#7890/#7139)で効かないため、
// AppKit を直接叩いて配置する。
use objc::{class, msg_send, sel, sel_impl};
use tauri_nspanel::cocoa::base::id;
use tauri_nspanel::cocoa::foundation::{NSPoint, NSRect};

const PANEL_WIDTH: f64 = 320.0;
const PANEL_HEIGHT: f64 = 520.0;

// AppKit 定数（cocoa クレートに定義が無いため直書き）
#[allow(non_upper_case_globals)]
const NSFloatWindowLevel: i32 = 4;
#[allow(non_upper_case_globals)]
const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;

/// Electron 版と同じデータディレクトリを返す。
/// dev（debug ビルド）は juice-dev、本番は Juice（~/Library/Application Support 下）。
fn resolve_data_dir() -> PathBuf {
    // テスト/検証用の明示上書き（本番経路には影響しない）
    if let Ok(dir) = std::env::var("JUICE_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let name = if cfg!(debug_assertions) {
        "juice-dev"
    } else {
        "Juice"
    };
    PathBuf::from(home)
        .join("Library/Application Support")
        .join(name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_nspanel::init())
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
            commands::timer_is_running,
            commands::get_launch_at_login,
            commands::set_launch_at_login,
            commands::sign_in_with_slack,
            commands::update_check,
            commands::update_install,
            commands::update_ready_to_quit,
        ])
        .setup(|app| {
            // データディレクトリは Electron 版と互換（dev=juice-dev / 本番=Juice）。
            let data_dir = resolve_data_dir();
            let _ = std::fs::create_dir_all(&data_dir);
            app.manage(SessionStore::new(data_dir.clone()));
            app.manage(DailyStore::new(data_dir.clone()));
            app.manage(SettingsStore::new(data_dir));
            app.manage(NotificationEngine::new());
            app.manage(holidays::HolidaysClient::new());
            app.manage(auth::AuthStore::new());
            app.manage(oauth::PendingState::default());
            app.manage(update::UpdateAck::default());

            // juice://auth コールバック（Slack サインイン）を deep-link で受ける。
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let cb_handle = app.app_handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        oauth::handle_callback(&cb_handle, url.as_str());
                    }
                });
            }

            // メニューバー常駐アプリ：Dock にアイコンを出さない（Electron の app.dock.hide 相当）
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.app_handle();
            // アイドル監視ループを開始（engine 登録後）
            notif_scheduler::init(handle);
            // 起動時 + 6時間ごとの更新確認（Electron 版 startPeriodicCheck 相当）
            update::start_periodic_check(handle);
            init_panel(handle);
            build_tray(handle)?;
            // 初回起動（セットアップ未完了）はセットアップ窓を出す（Electron 版と同じ）
            if !handle.state::<SettingsStore>().is_setup_completed() {
                open_aux_window(handle, "setup", "setup", "Juice — セットアップ", 480.0, 600.0);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// main ウィンドウを非アクティベート NSPanel に変換し、blur で閉じる挙動を仕込む。
fn init_panel(app_handle: &AppHandle) {
    let window: WebviewWindow = app_handle.get_webview_window("main").unwrap();
    let panel = window.to_panel().unwrap();

    // フローティングレベル（他ウィンドウより前面）
    panel.set_level(NSFloatWindowLevel);
    // ★ これがキモ：アプリをアクティブにせずに表示できる non-activating panel
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);
    // 表示時に現在の Space へ移動（全 Space 常駐＝「元画面に張り付く」のを回避）。
    // FullScreenAuxiliary はフルスクリーンアプリ上にも出せる挙動として残す。
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorMoveToActiveSpace
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
    );

    // blur-to-close：パネルが key ウィンドウでなくなったら（＝外側クリック）閉じる
    let handle = app_handle.to_owned();
    let delegate = panel_delegate!(JuicePanelDelegate {
        window_did_become_key,
        window_did_resign_key
    });
    delegate.set_listener(Box::new(move |name: String| {
        if name.as_str() == "window_did_resign_key" {
            if let Ok(panel) = handle.get_webview_panel("main") {
                panel.order_out(None);
            }
        }
    }));
    panel.set_delegate(delegate);
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

    TrayIconBuilder::with_id("main-tray")
        .icon(app_handle.default_window_icon().unwrap().clone())
        .icon_as_template(true) // ダーク/ライトメニューバーに追従
        .menu(&menu)
        .show_menu_on_left_click(false) // 左クリックはメニューでなくトグルに使う
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => open_settings(app),
            "quit" => app.exit(0),
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
fn open_aux_window(app: &AppHandle, label: &str, hash: &str, title: &str, w: f64, h: f64) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    let url = tauri::WebviewUrl::App(format!("index.html#{hash}").into());
    match tauri::WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(w, h)
        .resizable(false)
        .build()
    {
        Ok(win) => {
            let _ = win.set_focus();
            let handle = app.clone();
            win.on_window_event(move |ev| {
                if matches!(ev, tauri::WindowEvent::Destroyed) {
                    revert_activation_policy_if_no_aux(&handle);
                }
            });
        }
        Err(e) => eprintln!("[juice] open {label} window failed: {e}"),
    }
}

/// 付属ウィンドウ（settings/setup）が1つも無ければ Accessory（Dock 非表示）に戻す。
fn revert_activation_policy_if_no_aux(app: &AppHandle) {
    let has_aux =
        app.get_webview_window("settings").is_some() || app.get_webview_window("setup").is_some();
    if !has_aux {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }
}

/// 設定ウィンドウを開く（トレイ「設定」から）。
pub fn open_settings(app: &AppHandle) {
    open_aux_window(app, "settings", "settings", "Juice 設定", 440.0, 500.0);
}

/// トレイアイコンの真下にパネルを表示／非表示でトグルする。
fn toggle_panel(app: &AppHandle) {
    let panel = app.get_webview_panel("main").unwrap();
    if panel.is_visible() {
        panel.order_out(None);
        return;
    }
    let window = app.get_webview_window("main").unwrap();
    position_native(&window);
    panel.show();
}

/// AppKit を直接叩いてパネルを配置する。
/// カーソルのグローバル座標（Cocoa の左下原点・全画面共通空間）からカーソルが居る
/// NSScreen を特定し、その画面のメニューバー直下・カーソル中央に setFrameOrigin する。
/// Tauri の座標変換（macOS マルチモニタでバグあり）を完全にバイパスする。
fn position_native(window: &WebviewWindow) {
    let ns_window = match window.ns_window() {
        Ok(ptr) => ptr as id,
        Err(_) => return,
    };
    unsafe {
        // カーソルのグローバル座標（左下原点・全ディスプレイ共通）
        let mouse: NSPoint = msg_send![class!(NSEvent), mouseLocation];

        // カーソルを含む NSScreen の visibleFrame（メニューバー/Dock を除いた領域）を取得
        let screens: id = msg_send![class!(NSScreen), screens];
        let count: usize = msg_send![screens, count];
        let mut visible: Option<NSRect> = None;
        for i in 0..count {
            let screen: id = msg_send![screens, objectAtIndex: i];
            let frame: NSRect = msg_send![screen, frame];
            let in_x = mouse.x >= frame.origin.x && mouse.x <= frame.origin.x + frame.size.width;
            let in_y = mouse.y >= frame.origin.y && mouse.y <= frame.origin.y + frame.size.height;
            if in_x && in_y {
                visible = Some(msg_send![screen, visibleFrame]);
                break;
            }
        }
        let vis = match visible {
            Some(v) => v,
            None => return,
        };

        // 左下原点：可視領域の上端からパネル高さを引いた位置が origin.y
        let top_y = vis.origin.y + vis.size.height;
        let origin_x = mouse.x - PANEL_WIDTH / 2.0;
        let origin_y = top_y - PANEL_HEIGHT;

        eprintln!(
            "[juice] native place: mouse=({:.0},{:.0}) visTop={:.0} -> origin=({:.0},{:.0})",
            mouse.x, mouse.y, top_y, origin_x, origin_y
        );
        let origin = NSPoint {
            x: origin_x,
            y: origin_y,
        };
        let _: () = msg_send![ns_window, setFrameOrigin: origin];
    }
}
