// 通知の表示を1か所にまとめる。通知がクリックされたら Juice を前に出す（#149）。
//
// Windows は tauri-plugin-notification がクリックを受け取る口を持たないため、プラグインが
// 内部で使っている tauri-winrt-notification で直接出し、Activated イベントで受ける。
// macOS は当面プラグイン経由のまま（クリックしても何もしない）。

use crate::notifications::NOTIF_TITLE as TITLE;
use tauri::AppHandle;

/// 通知がクリックされたときに出す画面。
#[derive(Clone, Copy)]
pub enum OnClick {
    /// タイマーのパネル
    ShowPanel,
    /// 設定ウィンドウ（サインインを促す通知など）
    OpenSettings,
}

/// 通知を出す。失敗してもログに残すだけで、呼び出し元には返さない。
pub fn show(app: &AppHandle, body: &str, on_click: OnClick) {
    #[cfg(windows)]
    show_windows(app, body, on_click);
    #[cfg(not(windows))]
    {
        let _ = on_click;
        show_plugin(app, body);
    }
}

#[cfg(not(windows))]
fn show_plugin(app: &AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    if let Err(e) = app.notification().builder().title(TITLE).body(body).show() {
        eprintln!("[notif] show error: {e}");
    }
}

#[cfg(windows)]
fn show_windows(app: &AppHandle, body: &str, on_click: OnClick) {
    use tauri_winrt_notification::Toast;
    let app_id = windows_app_id(app);
    let handle = app.clone();
    let body = body.to_string();
    // WinRT の呼び出しでメインスレッドを止めないよう、プラグインと同じく別スレッドで出す
    tauri::async_runtime::spawn_blocking(move || {
        let on_activated = handle.clone();
        let result = Toast::new(&app_id)
            .title(TITLE)
            .text1(&body)
            .on_activated(move |_| {
                activate(&on_activated, on_click);
                Ok(())
            })
            .show();
        if let Err(e) = result {
            eprintln!("[notif] show error: {e}");
        }
    });
}

/// 通知の送り主（AppUserModelID）。インストール版はインストーラがショートカットに登録した
/// identifier を使う。target\debug / target\release から直接動かしているときは登録が無く、
/// 通知が出ないため PowerShell 名義で出す（tauri-plugin-notification と同じ判定）。
#[cfg(windows)]
fn windows_app_id(app: &AppHandle) -> String {
    use tauri_winrt_notification::Toast;
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let unpackaged = exe_dir
        .map(|d| d.ends_with("target\\debug") || d.ends_with("target\\release"))
        .unwrap_or(true);
    if unpackaged {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

#[cfg(windows)]
fn activate(app: &AppHandle, on_click: OnClick) {
    match on_click {
        OnClick::ShowPanel => crate::show_panel_now(app),
        OnClick::OpenSettings => crate::open_settings(app),
    }
}
