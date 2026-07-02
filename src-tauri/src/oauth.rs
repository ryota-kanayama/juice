// Slack サインインの OAuth フロー（Electron 版 src/main/auth/signIn.ts の Rust 移植）。
// ブラウザで proxy/auth/start?state=… を開き、juice://auth?token&state コールバックを
// deep-link で受けて state 照合 → トークン保存 → auth-changed 配信、を行う。
//
// 注: macOS では juice:// スキームは Info.plist（パッケージ版）でのみ OS に登録される。
// dev ビルドでは汎用バイナリに紐づくため、コールバックの E2E はパッケージ版で確認する
// （Electron 版と同じ制約）。

use crate::auth::AuthStore;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const STATE_TTL_MS: i64 = 10 * 60 * 1000;

use crate::config::proxy_url;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

struct Pending {
    state: String,
    expires_at: i64,
}

/// 進行中のサインイン state を1つだけ保持する（managed state）。
#[derive(Default)]
pub struct PendingState(Mutex<Option<Pending>>);

fn random_state() -> String {
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).expect("getrandom failed");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// ブラウザで Slack サインインを開始する。再度呼ぶと前回の state は無効になる。
pub fn start_sign_in(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let state = random_state();
    {
        let pending = app.state::<PendingState>();
        *pending.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(Pending {
            state: state.clone(),
            expires_at: now_ms() + STATE_TTL_MS,
        });
    }
    let url = format!("{}/auth/start?state={}", proxy_url(), state);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// juice://auth?token&state コールバックを処理する。
/// state 照合に成功した場合のみトークンを保存し true を返す。
pub fn handle_callback(app: &AppHandle, raw_url: &str) -> bool {
    let url = match url::Url::parse(raw_url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    if url.scheme() != "juice" || url.host_str() != Some("auth") {
        return false;
    }

    let token = url
        .query_pairs()
        .find(|(k, _)| k == "token")
        .map(|(_, v)| v.to_string());
    let state = url
        .query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string());

    // ワンショット: 成否によらず pending を使い捨てる
    let pending = app
        .state::<PendingState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();

    // サインイン進行中でなければ静かに無視する（無関係・悪意あるコールバック対策）
    let pending = match pending {
        Some(p) => p,
        None => return false,
    };

    if pending.state != state.unwrap_or_default() || now_ms() > pending.expires_at || token.is_none()
    {
        eprintln!("[oauth] callback rejected: state mismatch or expired");
        notify(app, "サインインに失敗しました。やり直してください。");
        return false;
    }

    let store = app.state::<AuthStore>();
    if let Err(e) = store.save_token(&token.unwrap()) {
        eprintln!("[oauth] save_token failed: {e}");
        notify(app, "サインインに失敗しました。やり直してください。");
        return false;
    }
    let status = store.get_status(now_ms());
    let _ = app.emit("auth-changed", &status);
    notify(
        app,
        &format!("Slack にサインインしました（{}）", status.name.clone().unwrap_or_default()),
    );
    true
}

fn notify(app: &AppHandle, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title("Juice")
        .body(body)
        .show();
}
